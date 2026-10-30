module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "Método não permitido." });
  }
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(503).json({ detail: "Configure SUPABASE_URL e SUPABASE_ANON_KEY na Vercel." });
  }
  // A anon/publishable key é pública por definição. Nunca exponha a service_role key aqui.
  return res.status(200).json({ url, anonKey });
};
