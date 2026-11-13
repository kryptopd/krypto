const { getSupabase, sendError, requireMethod, requireAdmin } = require('../../_lib/supabase');
const C = require('../../_lib/catalog');

// Uma única função para o que o painel faz no catálogo (a Vercel gratuita limita a 12 funções):
//   ?r=products              POST cadastra · PUT ?id= edita · DELETE ?id= tira da vitrine
//   ?r=categories            POST { name } cria · DELETE ?id= apaga (peças ficam sem categoria)
//   ?r=upload                POST { data: "data:image/jpeg;base64,..." } envia uma foto e devolve a URL
module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ["POST", "PUT", "DELETE"])) return;
  if (!(await requireAdmin(req, res))) return;
  try {
    const supabase = getSupabase(), route = String(req.query.r || ""), body = req.body || {};
    const id = Number(req.query.id), hasId = Number.isInteger(id) && id > 0;
    res.setHeader("Cache-Control", "no-store");

    if (route === "upload") {
      if (req.method !== "POST") throw C.fail(405, "Método não permitido.");
      return res.status(201).json(await C.uploadPhoto(supabase, body.data, body.thumb));
    }

    // Importação em lote: o painel lê a planilha (CSV) e manda as linhas. Linhas com erro são devolvidas, as boas são criadas.
    if (route === "import") {
      if (req.method !== "POST") throw C.fail(405, "Método não permitido.");
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) throw C.fail(400, "A planilha está vazia.");
      if (rows.length > 200) throw C.fail(400, "Importe no máximo 200 peças por vez.");
      const { data: existing, error: catError } = await supabase.from("categories").select("name");
      if (catError) throw C.isMissingSchema(catError) ? C.fail(503, C.MIGRATION_HINT) : catError;
      const known = new Set((existing || []).map((c) => c.name.toLowerCase()));
      const created = [], errors = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {}, line = i + 2;   // linha 1 é o cabeçalho
        try {
          const cat = String(r.category || "").trim();
          if (cat && !known.has(cat.toLowerCase())) {
            const ins = await supabase.from("categories").insert({ name: cat.slice(0, 40) }).select("name").single();
            if (ins.error && ins.error.code !== "23505") throw ins.error;
            known.add(cat.toLowerCase());
          }
          const sizes = String(r.sizes || "").split(/[,;|\s]+/).filter(Boolean);
          const product = await C.normalizeProduct(supabase, {
            name: r.name, category: cat, price: String(r.price || "").replace(",", "."), compare_at: String(r.compare_at || "").replace(",", "."),
            stock: Number(r.stock || 0), sizes, images: r.image_url ? [r.image_url] : [], description: r.description,
            composition: r.composition, care: r.care, weight_grams: r.weight_grams || ""
          });
          const { error } = await supabase.from("products").insert(product);
          if (error) throw error;
          created.push(product.name);
        } catch (e) { errors.push({ line, name: String(r.name || ""), message: e.message || "Linha inválida." }); }
      }
      return res.status(200).json({ created: created.length, errors });
    }

    if (route === "categories") {
      if (req.method === "POST") {
        const name = String(body.name || "").trim().replace(/\s+/g, " ");
        if (!name || name.length > 40) throw C.fail(400, "Informe o nome da categoria (até 40 letras).");
        const { data, error } = await supabase.from("categories").insert({ name }).select("id,name").single();
        if (error) {
          if (error.code === "23505") throw C.fail(409, "Já existe uma categoria com esse nome.");
          throw error;
        }
        return res.status(201).json(data);
      }
      if (req.method === "DELETE") {
        if (!hasId) throw C.fail(400, "ID inválido.");
        const { data: category, error: findError } = await supabase.from("categories").select("id,name").eq("id", id).maybeSingle();
        if (findError) throw findError;
        if (!category) throw C.fail(404, "Categoria não encontrada.");
        // As peças dessa categoria continuam na loja, só ficam sem categoria.
        const { data: moved, error: moveError } = await supabase.from("products").update({ category: "" }).eq("category", category.name).select("id");
        if (moveError) throw moveError;
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) throw error;
        return res.status(200).json({ deleted: category.name, unassigned_products: (moved || []).length });
      }
      throw C.fail(405, "Método não permitido.");
    }

    if (route === "products") {
      if (req.method === "POST") {
        const product = await C.normalizeProduct(supabase, body);
        const { data, error } = await supabase.from("products").insert(product).select("*").single();
        if (error) throw error;
        return res.status(201).json(data);
      }
      if (!hasId) throw C.fail(400, "ID inválido.");
      if (req.method === "DELETE") {
        // Só desativa, para preservar o histórico de pedidos.
        const { error } = await supabase.from("products").update({ active: false }).eq("id", id);
        if (error) throw error;
        return res.status(204).end();
      }
      const patch = await C.normalizeProduct(supabase, body);
      const { data: before, error: beforeError } = await supabase.from("products").select("images,image_url,colors").eq("id", id).maybeSingle();
      if (beforeError) throw beforeError;
      if (!before) throw C.fail(404, "Produto não encontrado.");
      const oldUrls = C.allPhotoUrls(before);   // guarda antes de editar
      const { data, error } = await supabase.from("products").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      // Fotos que saíram do produto também saem do Storage.
      await C.removePhotos(supabase, oldUrls.filter((u) => !C.allPhotoUrls(patch).includes(u)), { exceptId: id });
      return res.status(200).json(data);
    }

    throw C.fail(404, "Rota não encontrada.");
  } catch (error) {
    if (C.isMissingSchema(error)) return res.status(503).json({ detail: C.MIGRATION_HINT });
    return sendError(res, error);
  }
};
