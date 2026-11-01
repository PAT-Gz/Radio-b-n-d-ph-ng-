# 🏛️ Hồ Sơ Quyết Định Kiến Trúc (Architecture Decision Records - ADR)

> **Tài liệu này ghi lại các quyết định kiến trúc quan trọng nhất trong quá trình thiết kế và phát triển dự án Radio VN.**  
> Mỗi quyết định đều nêu rõ bối cảnh, các phương án xem xét, quyết định được chọn và lý do kỹ thuật đằng sau.

---

## 📌 Mục Lục ADR
- [ADR-001: Lựa chọn Kiến Trúc Monolithic Tinh Gọn (FastAPI + SQLite)](#adr-001-lựa-chọn-kiến-trúc-monolithic-tinh-gọn-fastapi--sqlite)
- [ADR-002: Lựa chọn Vanilla JavaScript & Tailwind CDN Thay Vì Framework SPA Phức Tạp](#adr-002-lựa-chọn-vanilla-javascript--tailwind-cdn-thay-vì-framework-spa-phức-tạp)
- [ADR-003: Cơ Chế Dual-Engine & Multi-Candidate Resolution Cho Google Gemini API](#adr-003-cơ-chế-dual-engine--multi-candidate-resolution-cho-google-gemini-api)
- [ADR-004: Tận Dụng Web Speech API & Web Audio API (Zero-Cost Audio)](#adr-004-tận-dụng-web-speech-api--web-audio-api-zero-cost-audio)
- [ADR-005: Thiết Kế Chuẩn Mobile App Viewport (390px x 844px)](#adr-005-thiết-kế-chuẩn-mobile-app-viewport-390px-x-844px)

---

## ADR-001: Lựa chọn Kiến Trúc Monolithic Tinh Gọn (FastAPI + SQLite)

### 1. Bối cảnh
Dự án cần một backend nhanh, dễ chạy trên localhost, không yêu cầu người dùng phải cài đặt thêm các phần mềm quản trị cơ sở dữ liệu cồng kềnh (PostgreSQL, MySQL, Docker). Đồng thời backend cần cung cấp REST API chuẩn cho frontend và có thể mount phục vụ file tĩnh của giao diện trực tiếp.

### 2. Các phương án xem xét
- **Phương án A:** Node.js (Express) + MongoDB.
- **Phương án B:** Python Flask + SQLite.
- **Phương án C:** Python FastAPI + SQLite (`sqlite3` tích hợp sẵn trong Python).

### 3. Quyết định
**Chọn Phương án C: Python FastAPI + SQLite.**

### 4. Lý do kỹ thuật
- **Hiệu năng & Bất đồng bộ (Async):** FastAPI hoạt động trên nền tảng ASGI (Uvicorn) mang lại tốc độ xử lý I/O cao, hỗ trợ tự nhiên kiểu dữ liệu Pydantic giúp xác thực request/response tự động.
- **Không phụ thuộc cài đặt ngoài:** SQLite là database dạng file đơn lẻ (`radio_vn.db`), thư viện `sqlite3` có sẵn trong bộ cài chuẩn của Python, người dùng chỉ cần clone mã nguồn về là có thể chạy ngay với `python -m uvicorn main:app`.
- **Mount Static Files tích hợp:** FastAPI cho phép `app.mount("/", StaticFiles(directory="frontend", html=True))` giúp chạy toàn bộ hệ sinh thái (cả API và giao diện) chỉ trên **một cổng duy nhất (Port 8000)**, loại bỏ hoàn toàn các rắc rối về CORS trên trình duyệt.

---

## ADR-002: Lựa chọn Vanilla JavaScript & Tailwind CDN Thay Vì Framework SPA Phức Tạp

### 1. Bối cảnh
Giao diện ứng dụng cần đạt chuẩn Prototype Mobile App hiện đại (iOS/Android), hỗ trợ chuyển đổi màn hình mượt mà, modal popup, mini player và canvas visualizer. Người dùng cần có thể mở và chạy ngay lập tức mà không phải cài Node.js, npm, webpack hay vite build tools.

### 2. Các phương án xem xét
- **Phương án A:** React.js / Next.js / Vue.js + Vite.
- **Phương án B:** HTML5 + CSS thuần không framework.
- **Phương án C:** Vanilla JavaScript (ES6 Modules) + Tailwind CSS (qua CDN) + CSS3 tùy biến.

### 3. Quyết định
**Chọn Phương án C: Vanilla JavaScript + Tailwind CSS qua CDN.**

### 4. Lý do kỹ thuật
- **Zero Build Step:** Ứng dụng nạp trực tiếp qua trình duyệt mà không cần bước `npm install` hay `npm run build`.
- **Dễ hiểu, dễ đọc:** Cấu trúc mã nguồn trong [index.html](file:///d:/Radio/radio-vn-demo/frontend/index.html), [styles.css](file:///d:/Radio/radio-vn-demo/frontend/styles.css) và [app.js](file:///d:/Radio/radio-vn-demo/frontend/app.js) tường minh, một kỹ sư ở bất kỳ cấp độ nào cũng có thể đọc hiểu và mở rộng dễ dàng.
- **Linh hoạt thẩm mỹ:** Sử dụng Tailwind CDN cho hệ thống spacing, flexbox, grid tiện lợi, kết hợp với các class tùy biến trong `styles.css` để tạo hiệu ứng kính mờ *Glassmorphism* và *Neon border* cao cấp.

---

## ADR-003: Cơ Chế Dual-Engine & Multi-Candidate Resolution Cho Google Gemini API

### 1. Bối cảnh
Khi tích hợp Google Gemini API, các phiên bản model thường xuyên được cập nhật trên Google AI Studio. Một số model cũ như `gemini-1.5-flash` hoặc `gemini-2.5-flash` có thể bị gỡ bỏ hoặc thông báo `404 NotFound / No longer available to new users`. Đồng thời, giao thức gRPC của SDK Python trên một số môi trường mạng Windows có thể bị chậm hoặc timeout.

### 2. Quyết định
**Triển khai kiến trúc Dual-Engine kết hợp danh sách Multi-Candidate Model trong [gemini_service.py](file:///d:/Radio/radio-vn-demo/backend/gemini_service.py).**

### 3. Chi tiết triển khai
1. **Multi-Candidate Model Resolution:** Định nghĩa danh sách model ưu tiên: `[GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]`. Nếu model đầu tiên trả về mã lỗi 404, hệ thống chuyển ngay sang model kế tiếp mà không delay.
2. **Dual-Engine:**
   - *Engine 1 (SDK):* Sử dụng `google-generativeai` nếu có.
   - *Engine 2 (REST API):* Sử dụng trực tiếp `requests.post("https://generativelanguage.googleapis.com/v1beta/models/...")` với timeout ngắn (10-15s), hoàn toàn không bị ảnh hưởng bởi lỗi gRPC.
3. **Local Semantic Fallback:** Nếu mạng mất kết nối hoặc chưa nhập API Key, kích hoạt bộ phân tích ngữ nghĩa cục bộ dự phòng trong <100ms, đảm bảo server không bao giờ bị sập.

---

## ADR-004: Tận Dụng Web Speech API & Web Audio API (Zero-Cost Audio)

### 1. Bối cảnh
Dự án là sản phẩm thử nghiệm (Prototype) phát thanh tin tức cá nhân hóa. Nếu tích hợp các dịch vụ Text-to-Speech (TTS) đám mây thương mại như FPT.AI, Zalo AI, Google Cloud TTS hay ElevenLabs thì chi phí rất cao và bắt buộc người dùng phải đăng ký thẻ tín dụng/API key riêng cho âm thanh.

### 2. Quyết định
**Sử dụng hoàn toàn Web Speech API (`window.speechSynthesis`) và Web Audio API (`AudioContext`) có sẵn trong trình duyệt.**

### 3. Giải pháp chống lỗi Timeout 15s của trình duyệt
- Trình duyệt Chrome/Edge có một lỗi cố hữu: tự động dừng `SpeechSynthesis` sau 15 giây phát văn bản liên tục.
- **Giải pháp `RadioAudioEngine`:**
  - Tự động cắt văn bản 400 - 600 từ thành các câu ngữ nghĩa ngắn bằng regex: `text.match(/[^.?!;\n]+[.?!;\n]+|[^.?!;\n]+$/g)`.
  - Phát tuần tự từng câu qua hàng đợi `speakNextChunk()`.
  - Chạy một `heartbeatTimer` (chu kỳ 9 giây gọi `pause()` và `resume()`) để ngăn cơ chế Garbage Collection của trình duyệt thu hồi bộ nhớ.
  - Sử dụng `AudioContext` tạo sóng sin ba nốt (523Hz - 659Hz - 784Hz) làm tiếng chuông Radio Chime jingle trước mỗi bản tin.

---

## ADR-005: Thiết Kế Chuẩn Mobile App Viewport (390px x 844px)

### 1. Bối cảnh
Hành vi tiêu thụ tin tức phát thanh thường diễn ra trên điện thoại di động (khi lái xe, chạy bộ, đi lại). Nếu thiết kế giao diện web desktop truyền thống với các cột dàn trải ngang, trải nghiệm sẽ rất rời rạc và không phản ánh được tinh thần ứng dụng radio di động.

### 2. Quyết định
**Chuẩn hóa toàn bộ giao diện thành Prototype Mobile Application với Viewport 390px x 844px.**

### 3. Chi tiết triển khai
- Trên máy tính: Hiển thị như một chiếc iPhone hiện đại căn giữa màn hình với bo góc 46px, viền kim loại, Dynamic Island và thanh trạng thái Status Bar.
- Trên điện thoại thật: Tự động mở rộng 100% toàn màn hình (`viewport-fit=cover`).
- Bố cục công thái học: Nút tạo kênh nhanh (+) nhô cao ở trung tâm thanh Bottom Navigation Bar, người dùng có thể thao tác hoàn toàn bằng một ngón tay cái.
