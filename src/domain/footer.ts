export const FOOTER_VERSION = 'footer-v2';
export const CAPTION_SEPARATOR = '============';
export const FOOTER = `Ngành Kinh tế số (Chuyên ngành Kinh doanh số) giúp người học làm chủ công nghệ AI, blockchain, big data để phân tích dữ liệu và đưa ra quyết định thông minh. Kết hợp kiến thức kinh tế - công nghệ hiện đại, bạn sẽ phát triển tư duy kinh doanh sáng tạo, làm chủ xu hướng chuyển đổi số và tự tin chinh phục thị trường toàn cầu!
NGÀNH KINH TẾ SỐ, KHOA QTKD, TRƯỜNG ĐẠI HỌC NGUYỄN TẤT THÀNH
📞 Hotline: 1900 2039 – Ext: 429
✉️ Email: tran.tung@nttu.edu.vn
🚩 Địa chỉ: Tầng 1, 331 Đỗ Mười, Phường An Phú Đông, TP. Hồ Chí Minh, Việt Nam
🌐 Website: https://fba.ntt.edu.vn/kinh-te-so/
🌟 Fanpage: https://www.facebook.com/NganhKinhTeSoNTTU
🌟 Tiktok: https://www.tiktok.com/@nganhkinhteso_nttu
#NTTU #NguyenTatThanhUniversity #nganhkinhteso #kinhteso`;

export function removeTrailingSeparator(body: string): string {
  return body.replace(/(?:^|\n)[ \t]*============(?:\s*============)*\s*$/u, '').trimEnd();
}

export function composeCaption(body: string): string {
  let trimmed = body.trim();
  if (!trimmed) throw new Error('Caption body is empty');
  if (trimmed.includes(FOOTER)) {
    if (!trimmed.endsWith(FOOTER) || trimmed.indexOf(FOOTER) !== trimmed.lastIndexOf(FOOTER)) return invalid();
    trimmed = trimmed.slice(0, -FOOTER.length).trimEnd();
  }
  // Partial or stale branding blocks must be corrected, not silently doubled.
  if (trimmed.includes('NGÀNH KINH TẾ SỐ, KHOA QTKD, TRƯỜNG ĐẠI HỌC NGUYỄN TẤT THÀNH')
    || trimmed.includes('#NguyenTatThanhUniversity')) return invalid();
  trimmed = removeTrailingSeparator(trimmed);
  if (!trimmed) throw new Error('Caption body is empty');
  return `${trimmed}\n\n${CAPTION_SEPARATOR}\n\n${FOOTER}`;
}
function invalid(): never { throw new Error('Footer duplicated, incomplete or not at end'); }
