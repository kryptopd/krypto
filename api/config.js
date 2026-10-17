module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "Método não permitido." });
  }
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(503).json({ detail: "Configure SUPABASE_URL e SUPABASE_ANON_KEY na Vercel." });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ url, anonKey });
};
