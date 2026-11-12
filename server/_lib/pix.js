// Gera o "PIX Copia e Cola" (BR Code estático) com o valor do pedido já embutido.
// Assim, ao colar no app do banco, o valor aparece preenchido. Não depende de nenhum serviço externo.
function tlv(id, value) { return id + String(value.length).padStart(2, "0") + value; }
function clean(text, max) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, max);
}
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function buildPixPayload({ key, amountCents, merchantName, merchantCity, txid }) {
  const amount = (Number(amountCents) / 100).toFixed(2);
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", String(key).trim());
  const id = clean(txid, 25).replace(/ /g, "") || "***";
  const body =
    tlv("00", "01") + tlv("01", "11") + tlv("26", account) + tlv("52", "0000") + tlv("53", "986") +
    tlv("54", amount) + tlv("58", "BR") + tlv("59", clean(merchantName, 25) || "LOJA") +
    tlv("60", clean(merchantCity, 15) || "BRASIL") + tlv("62", tlv("05", id)) + "6304";
  return body + crc16(body);
}
module.exports = { buildPixPayload, crc16 };
