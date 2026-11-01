# 📜 Quy Tắc & Tiêu Chuẩn Kỹ Thuật Dự Án "Radio VN" (Project Rules)

> **Tài liệu này là bộ quy ước bắt buộc (Mandatory Engineering Guidelines) dành cho toàn bộ kỹ sư phần mềm, AI Coding Assistants và người phát triển tham gia xây dựng hệ thống Radio VN.**  
> Mọi thay đổi mã nguồn, tính năng mới hoặc chỉnh sửa giao diện đều phải tuân thủ nghiêm ngặt các quy tắc dưới đây.

---

## 1. Tầm Nhìn & Sứ Mệnh Dự Án
- **Tên dự án:** Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa (AI Radio Studio).
- **Mục tiêu:** Cung cấp trải nghiệm nghe tin tức và phát thanh trực tiếp rảnh tay (*hands-free*) hoàn toàn tự động, chất lượng cao, chọn lọc từ các nguồn báo chí chính thống uy tín của Việt Nam cho người bận rộn, người đi đường và giới bác tài trên cabin ô tô.
- **Triết lý sản phẩm:** *Đơn giản bên ngoài, thông minh bên trong.* Người dùng chỉ cần đưa ra ý tưởng bằng ngôn ngữ tự nhiên (Prompt), AI sẽ đảm nhiệm toàn bộ khâu biên tập, lọc nguồn tin, kiểm duyệt và phát thanh.

---

## 2. Ràng Buộc Công Nghệ Cốt Lõi (Technology Stack Constraints)

### 2.1. Backend
- **Ngôn ngữ:** Python 3.10+ (sử dụng typing hints đầy đủ).
- **Framework:** FastAPI với máy chủ ASGI Uvicorn.
- **Cơ sở dữ liệu:** SQLite (thư viện chuẩn `sqlite3` trong Python, file `backend/radio_vn.db`).
- **Thư viện AI:** `google-generativeai` kết hợp cơ chế gọi trực tiếp Google Gemini REST API qua `requests`.
- **Cào dữ liệu & xử lý Web:** `beautifulsoup4`, `requests`, `urllib.parse`.
- **Quản lý biến môi trường:** `python-dotenv`.
- ❌ **CẤM:** Tuyệt đối không cài đặt các dịch vụ cơ sở dữ liệu cồng kềnh ngoài SQLite (không dùng PostgreSQL, MySQL, Redis nếu chưa có chỉ định kiến trúc riêng).

### 2.2. Frontend
- **Ngôn ngữ:** HTML5, CSS3, Vanilla JavaScript (ES6+).
- **Styling:** Tailwind CSS qua CDN (`https://cdn.tailwindcss.com`) kết hợp Vanilla CSS trong [styles.css](file:///d:/Radio/radio-vn-demo/frontend/styles.css) cho các hiệu ứng ánh sáng neon, glassmorphism, và canvas visualizer.
- **Icon:** Lucide Icons qua CDN (`https://unpkg.com/lucide@latest`).
- ❌ **CẤM:** Không sử dụng các framework nặng như React, Vue, Angular hay Tailwind CLI/Node build tools phức tạp để giữ mã nguồn nhẹ, nạp nhanh tức thì và dễ dàng chỉnh sửa.

### 2.3. Âm thanh & Xử lý Giọng đọc (Audio & TTS)
- **Hoàn toàn không dùng API TTS ngoài tính phí:** Sử dụng **Web Speech API** (`window.speechSynthesis`) có sẵn trong trình duyệt.
- **Nhạc chuông hiệu ứng:** Sử dụng **Web Audio API** (`AudioContext`) tổng hợp âm thanh tần số thực.
- **Hiển thị trực quan:** Sử dụng **HTML5 Canvas API** để vẽ sóng âm động học.

---

## 3. Quy Tắc Phát Triển Backend (FastAPI & Python)

1. **Clean Architecture & Separation of Concerns:**
   - [main.py](file:///d:/Radio/radio-vn-demo/backend/main.py): Chỉ chứa các định tuyến API (Endpoints), cấu hình Middleware, mount static files và xử lý HTTP Request/Response.
   - [gemini_service.py](file:///d:/Radio/radio-vn-demo/backend/gemini_service.py): Chịu trách nhiệm toàn bộ logic tương tác với Gemini AI (Semantic validation, Model resolution, Editorial script generation, Source recommendation).
   - [database.py](file:///d:/Radio/radio-vn-demo/backend/database.py): Quản lý kết nối, giao dịch (*transactions*) và các câu lệnh CRUD với SQLite.
   - [crawler.py](file:///d:/Radio/radio-vn-demo/backend/crawler.py): Quản lý Whitelist tên miền báo chí và trích xuất tin tức.
   - [ai_editorial.py](file:///d:/Radio/radio-vn-demo/backend/ai_editorial.py): Danh mục giọng đọc MC AI và định hướng âm thanh truyền thanh.

2. **Xử lý Dữ liệu với Pydantic Schemas:**
   - Mọi payload gửi lên (POST/PUT) phải được định nghĩa bằng `BaseModel` của Pydantic với validation tối thiểu (độ dài, kiểu dữ liệu, giá trị mặc định).

3. **Xử lý Ngoại Lệ & Mã Lỗi HTTP:**
   - Không để lọt các lỗi máy chủ chưa bắt (*unhandled 500 exceptions*). Luôn bọc trong khối `try/except` và ném ra `HTTPException` với `status_code` phù hợp (400 cho client error, 401 cho auth, 404 cho not found, 500 cho server error).

4. **Quản lý Kết nối Cơ sở dữ liệu SQLite:**
   - Luôn sử dụng hàm trợ giúp `get_db_connection()` với Row Factory dictionary (`sqlite3.Row`).
   - Bắt buộc gọi `conn.commit()` khi thay đổi dữ liệu (INSERT, UPDATE, DELETE) và giải phóng kết nối trong khối `finally: conn.close()`.

5. **Độc Lập Thư Mục Chạy (Working Directory Independence):**
   - File [main.py](file:///d:/Radio/radio-vn-demo/backend/main.py) phải luôn có đoạn mã chèn đường dẫn `backend_dir` vào `sys.path` để dù khởi chạy từ thư mục gốc hay thư mục backend thì Python vẫn tìm thấy các module phụ thuộc:
     ```python
     backend_dir = Path(__file__).resolve().parent
     if str(backend_dir) not in sys.path:
         sys.path.insert(0, str(backend_dir))
     ```

---

## 4. Quy Tắc Phát Triển AI & Gemini API

1. **Tuyệt Đối Không Hardcode Từ Khóa Bằng if/else:**
   - Không được phân tích chủ đề bằng việc quét từ khóa thủ công (`if "game" in prompt: ...`).
   - Bắt buộc gửi prompt qua `gemini_service.validate_prompt_with_gemini()` để thực hiện phân tích ngữ nghĩa (*Semantic Analysis*), trả về cấu trúc JSON chuẩn gồm: `valid`, `is_valid`, `topic_category`, `topic_label`, `inferred_tone`, `suggested_title`, `feedback_message`, `summary`.

2. **Cơ Chế Danh Sách Model Ứng Viên (Candidate Models Resolution):**
   - Khi Google cập nhật hoặc ngưng hỗ trợ một model (như đã từng xảy ra với `gemini-1.5-flash`), hệ thống không được dừng hoạt động.
   - Bắt buộc dùng hàm `get_candidate_models()` duyệt qua danh sách ưu tiên: `[GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]`.
   - Nếu gặp lỗi `404` hoặc `NotFound`, lập tức chuyển sang model kế tiếp mà không chờ timeout.

3. **Giới Hạn Thời Gian Chờ (Fast Timeout):**
   - Timeout cho mỗi cuộc gọi Gemini API không được vượt quá **15 giây**.
   - Nếu toàn bộ các model đám mây không khả dụng, hệ thống phải tự động kích hoạt bộ phân tích dự phòng cục bộ (*Local Semantic Fallback*) trong thời gian dưới 100ms.

4. **Độ Dài & Tiêu Chuẩn Kịch Bản Phát Thanh (Step 4):**
   - Kịch bản phát thanh AI bắt buộc phải dài dặn (**400 đến 600 từ**), không được sử dụng mock data ngắn ngủn 50-100 từ.
   - Kịch bản phải có đầy đủ 4 phần chuẩn:
     1. Station ID & Lời chào MC (`[SFX: Nhạc hiệu mở đầu độc quyền...]`).
     2. Lời dẫn chuyển đoạn mượt mà (`[SFX: Nhạc chuyển cảnh...]`).
     3. 3 đến 4 mục tin tức phân tích chuyên sâu, đa góc nhìn, có dẫn chứng nguồn báo chính thống.
     4. Lời kết dặn dò thính giả, dặn lái xe an toàn và lời chào tạm biệt.

5. **Bảo Mật API Key:**
   - Tuyệt đối không commit trực tiếp `GEMINI_API_KEY` vào mã nguồn Git.
   - Luôn nạp key qua file `.env` hoặc biến môi trường hệ thống.

---

## 5. Quy Tắc Phát Triển Frontend (Giao Diện & Mobile Viewport)

1. **Thiết Kế Chuẩn Mobile App Viewport:**
   - Kích thước chuẩn hiển thị: `390px x 844px` (tỉ lệ chuẩn màn hình iPhone).
   - Trên màn hình Desktop: Căn giữa màn hình, hiển thị khung viền điện thoại với Dynamic Island, bo góc 46px và đổ bóng ambient glow.
   - Trên thiết bị di động thật: Mở rộng tràn viền 100% tự nhiên (`viewport-fit=cover`).

2. **Thẩm Mỹ Thị Giác Cao Cấp (Premium Visual Aesthetics):**
   - Tông màu chủ đạo: Dark Theme công nghệ cao (Deep Navy `#070b14`, Slate `#0f172a`).
   - Sử dụng hiệu ứng kính mờ *Glassmorphism* (`backdrop-blur-md`, viền phát sáng cyan/indigo mỏng 1px).
   - Tuyệt đối tránh giao diện màu sắc cơ bản sơ sài.

3. **Cơ Chế Single Source of Truth (State Store):**
   - Mọi biến trạng thái người dùng, kênh đang phát, tiến trình Wizard, danh mục giọng đọc đều phải lưu trong đối tượng `state` tập trung của [app.js](file:///d:/Radio/radio-vn-demo/frontend/app.js).
   - Không lưu trữ trạng thái phân tán vào thuộc tính DOM.

4. **Xử Lý Sự Kiện & Lucide Icons:**
   - Mỗi khi DOM được render lại bằng `innerHTML`, bắt buộc phải gọi `if (window.lucide) window.lucide.createIcons();` để các icon hiển thị đầy đủ.

---

## 6. Quy Tắc Âm Thanh & Speech Synthesis (Audio Engine)

1. **Khắc Phục Lỗi Timeout 15s Của Trình Duyệt:**
   - Trình duyệt Chrome/Edge tự động ngắt `window.speechSynthesis` nếu một câu thoại kéo dài hơn 15 giây.
   - Bắt buộc phân tách kịch bản dài thành các câu nhỏ (*Sentence Chunking*) qua Regular Expression:
     `text.match(/[^.?!;\n]+[.?!;\n]+|[^.?!;\n]+$/g)`
   - Phát lần lượt từng câu qua hàm `speakNextChunk()`.
   - Duy trì một `heartbeatTimer` (chu kỳ 9 giây gọi `pause()` và `resume()`) để ngăn Garbage Collection của trình duyệt thu hồi bộ nhớ âm thanh.

2. **Khởi Tạo Nhạc Chuông Jingle An Toàn:**
   - Trình duyệt yêu cầu cử chỉ chạm người dùng (*User Gesture*) để kích hoạt âm thanh.
   - Bắt buộc kiểm tra `AudioContext.state === 'suspended'` và gọi `resume()` trong sự kiện click của người dùng trước khi phát âm thanh.

---

## 7. Quy Trình Kiểm Thử & Bàn Giao (Delivery Checklist)

Trước khi xác nhận bàn giao một tính năng hoặc phiên bản mới, bắt buộc kiểm tra các mục sau:
- [ ] Backend khởi động không lỗi: `python -m uvicorn main:app --reload`.
- [ ] Endpoint `/api/health` trả về `{"status": "healthy"}`.
- [ ] Luồng Authentication Gate: Người dùng mới bị chặn ở màn hình Login, người dùng đã đăng nhập vào thẳng Onboarding hoặc Dashboard.
- [ ] Luồng Wizard 4 bước hoạt động mượt mà:
  - [ ] Nhập prompt tự do hoặc bấm thẻ Quick Tags -> AI duyệt trả về thẻ xanh.
  - [ ] Đề xuất 5-8 nguồn báo chính thống -> Bật tắt và kiểm tra whitelist .vn.
  - [ ] Nghe thử giọng đọc MC không bị lỗi âm thanh.
  - [ ] Tạo kịch bản radio dài 400-600 từ -> Lưu kênh và phát sóng tự động.
- [ ] Sticky Mini Player và Fullscreen Player đồng bộ thời gian thực.
- [ ] File [map.md](file:///d:/Radio/radio-vn-demo/map.md) đã được cập nhật nếu có file mới được tạo hoặc di chuyển.
