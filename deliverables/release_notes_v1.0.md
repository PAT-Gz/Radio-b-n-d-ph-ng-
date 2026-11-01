# 🚀 Biên Bản Bàn Giao Phiên Bản v1.0 (Release Notes v1.0)

- **Dự án:** Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa (AI Radio Studio Mobile Prototype)
- **Phiên bản:** v1.0.0 (Production-Ready Prototype)
- **Thời gian hoàn thành:** 28/10/2026
- **Vai trò:** Senior Software Architect & Tech Lead
- **Môi trường thử nghiệm:** Windows 11, Python 3.13, Google Chrome / Microsoft Edge

---

## 1. Tóm Tắt Phiên Bản

Phiên bản **Radio VN v1.0** đánh dấu bước chuyển mình hoàn chỉnh từ một ý tưởng thử nghiệm sang một **Prototype Mobile Application** hoàn thiện, hoạt động mượt mà cả ở Frontend và Backend, đáp ứng 100% các tiêu chuẩn UX/UI mới nhất và tích hợp trí tuệ nhân tạo thực tế thông qua Google AI Studio (Gemini API).

---

## 2. Chi Tiết Các Tính Năng Đã Hoàn Thành

### 2.1. Cổng Xác Thực Bắt Buộc & Onboarding Flow (Authentication Gate)
- Khi người dùng mở ứng dụng, màn hình đầu tiên hiển thị là **Cổng Đăng Nhập / Đăng Ký** (chưa cho vào Dashboard hoặc tạo kênh).
- Tích hợp nút **"Đăng Nhập Nhanh Bằng Tài Khoản Demo" (1-Click)** giúp trải nghiệm tức thì mà không cần gõ bàn phím.
- **Onboarding Flow:** Sau khi đăng nhập thành công lần đầu (`isOnboarded == false`), ứng dụng chuyển thẳng người dùng tới **Wizard Tạo Kênh Radio Mới**. Sau khi hoàn tất kênh đầu tiên, hệ thống mới lưu phiên và đưa về Trang Chủ.

### 2.2. Quy Trình 4 Bước Tạo Kênh Bằng Prompt (Vertical Step-by-Step Wizard)
- **Bước 1: Nhập Prompt Tự Do & AI Semantic Validation:**
  - Cho phép người dùng gõ bất kỳ ý tưởng nào bằng ngôn ngữ tự nhiên.
  - Tích hợp **6 Thẻ Gợi Ý Nhanh (Quick Prompt Tags)**:
    1. 🎮 *Esports & Game* (Liên Quân Mobile, LMHT, game công nghệ mới).
    2. 🚗 *Bác tài cao tốc* (Giao thông toàn quốc, thời tiết, kỹ năng lái xe).
    3. 💼 *Tài chính & BĐS* (Chứng khoán, giá vàng, bất động sản, đầu tư).
    4. 💻 *Công nghệ & AI* (Xu hướng AI, bán dẫn, chuyển đổi số).
    5. ⚽ *Thể thao 24/7* (Bóng đá Ngoại hạng, V-League, Marathon).
    6. 🌐 *Tin tức Tổng hợp HOT* (Điểm tin nóng từ báo chí chính thống).
  - Khi chạm vào thẻ, mẫu prompt chi tiết tự động điền vào textarea.
  - Bấm nút **"Gửi Prompt Để AI Kiểm Tra & Duyệt"**: Gemini API phân tích ngữ nghĩa, trả về phản hồi dạng thẻ xanh kèm chủ đề chuẩn hóa, phong cách dẫn, tên kênh đề xuất và mở nút "Tiếp tục".
- **Bước 2: AI Gợi Ý Nguồn Báo Uy Tín & Whitelist:**
  - Tự động xuất 5 đến 8 website báo chí chính thống (.vn) phù hợp với chủ đề đã duyệt.
  - Cho phép bật/tắt từng nguồn báo.
  - Hỗ trợ ô nhập URL tùy biến để kiểm tra với danh sách Whitelist báo chí Việt Nam.
- **Bước 3: Chọn Giọng Đọc MC & Hình Thức Phát Sóng:**
  - Chọn 1 trong 4 giọng đọc MC AI (Minh Quân - Bắc Nam, Thu Hà - Bắc Nữ, Tấn Phát - Nam Nam, Mai Phương - Nam Nữ).
  - Có nút nghe thử mẫu giọng thực tế kèm tiếng chuông Radio Chime.
  - Chọn Hình thức phát sóng duy nhất tại bước này: 🔴 24/24 Live Stream | ⏰ Khung giờ | 🎙️ Podcast On-Demand.
- **Bước 4: AI Biên Tập & Lên Sóng Trực Tiếp:**
  - Gemini tổng hợp tin tức đa nguồn và biên tập kịch bản radio hoàn chỉnh dài dặn (**400 - 600 từ**), có cấu trúc 4 phần chuẩn mực (Station ID, Lời chào MC, Chuyển đoạn [SFX], 3-4 tin tức phân tích chuyên sâu, Lời kết dặn dò thính giả).
  - Bấm "Lưu Kênh & Bắt Đầu Nghe" để kích hoạt phát sóng tức thì.

### 2.3. Trình Phát Âm Thanh Số & Canvas Visualizer
- **Khắc phục lỗi ngắt tiếng sau 15s:** Lớp `RadioAudioEngine` chia nhỏ kịch bản dài thành các câu tuần tự (*Sentence Chunking*) và duy trì `heartbeatTimer` chu kỳ 9s ngăn Chrome/Edge ngắt âm thanh giữa chừng.
- **Web Audio API Jingle Synthesizer:** Tự động tổng hợp hợp âm 3 nốt chuông đài phát thanh (C5-E5-G5) trước mỗi bản tin.
- **HTML5 Canvas Dynamic Visualizer:** Kết xuất 28 thanh sóng âm thanh đối xứng chuyển màu Sky-to-Indigo, dao động trực tiếp theo trạng thái đọc.
- **Sticky Mini Player & Fullscreen Player:** Đồng bộ thời gian thực, hỗ trợ tua ±10s, chọn tốc độ (0.8x, 1.0x, 1.25x) và mở xem toàn văn kịch bản qua Bottom Sheet.

### 2.4. Khắc Phục Lỗi Model 404 & Khởi Chạy
- Giải quyết triệt để lỗi `models/gemini-1.5-flash is not found for API version v1beta` bằng cách nâng cấp mặc định sang **`gemini-3.5-flash`** cùng cơ chế tự động thử danh sách model ứng viên (`candidate_models`).
- Sửa lỗi cú pháp file [run.bat](file:///d:/Radio/radio-vn-demo/run.bat) và bổ sung `sys.path.insert` trong [main.py](file:///d:/Radio/radio-vn-demo/backend/main.py) giúp khởi chạy 1-click mượt mà từ bất kỳ đâu.

---

## 3. Danh Mục Các Endpoint Đã Bàn Giao

| Phương thức | Đường dẫn API | Mô tả chức năng |
|---|---|---|
| `POST` | `/api/auth/register` | Đăng ký tài khoản người dùng mới |
| `POST` | `/api/auth/login` | Đăng nhập tài khoản hoặc chế độ Demo |
| `GET` | `/api/auth/me` | Lấy thông tin tài khoản hiện tại |
| `GET` | `/api/channels` | Lấy danh sách kênh phát thanh của người dùng |
| `POST` | `/api/channels` | Tạo kênh mới và tự động sinh bản tin đầu tiên |
| `GET` | `/api/channels/{id}` | Lấy chi tiết kênh và bản tin mới nhất |
| `DELETE` | `/api/channels/{id}` | Xóa kênh phát thanh |
| `POST` | `/api/channels/{id}/generate-broadcast` | Cào tin tức mới và làm mới bản tin trực tiếp |
| `POST` | `/api/ai/validate-prompt` | Phân tích ngữ nghĩa Semantic Prompt qua Gemini |
| `GET` | `/api/sources/suggest` | Đề xuất 5-8 nguồn báo chính thống theo chủ đề |
| `POST` | `/api/sources/check-domain` | Kiểm tra tên miền báo chí có thuộc Whitelist .vn |
| `GET` | `/api/voices` | Lấy danh bạ giọng đọc 4 MC AI Tiếng Việt |
| `POST` | `/api/generate-script` | Sinh kịch bản phát thanh nội dung sâu (400-600 từ) |
| `POST` | `/api/ai/editorial-preview` | Alias xem trước kịch bản cho Wizard Bước 4 |
| `GET` | `/api/health` | Kiểm tra sức khỏe hệ thống & trạng thái kết nối Gemini |
| `GET` | `/*` | Mount phục vụ giao diện tĩnh Single Page Application |

---

## 4. Biên Bản Kiểm Thử Hoàn Thành

| Nội Dung Kiểm Thử | Kết Quả Thực Tế | Trạng Thái |
|---|---|---|
| Khởi chạy máy chủ FastAPI qua Uvicorn | Server chạy tại port 8000 không lỗi | ✅ ĐẠT |
| Cổng Authentication Gate | Chặn người dùng chưa đăng nhập, nút Demo 1-click hoạt động tức thì | ✅ ĐẠT |
| Chạm thẻ Quick Tags | Tự động điền prompt mẫu chi tiết vào ô nhập | ✅ ĐẠT |
| Phân tích ngữ nghĩa Prompt bằng Gemini | Nhận diện chính xác chủ đề, phong cách, tên kênh gợi ý | ✅ ĐẠT |
| Đề xuất nguồn báo chính thống | Xuất 5-8 cơ quan báo chí .vn chuẩn xác | ✅ ĐẠT |
| Nghe thử mẫu giọng MC | Web Audio jingle vang lên mượt mà trước giọng đọc | ✅ ĐẠT |
| Biên tập kịch bản sâu 400-600 từ | Kịch bản dài dặn, đầy đủ 4 phần chuẩn phát thanh | ✅ ĐẠT |
| Phát âm thanh dài không ngắt sau 15s | Sentence chunking phát âm liên tục mượt mà | ✅ ĐẠT |
| Sóng âm Canvas Visualizer | 28 cột sóng dao động uyển chuyển khi phát và đứng yên khi pause | ✅ ĐẠT |
| Sticky Mini Player & Fullscreen Player | Trượt mở mượt mà, đồng bộ thanh tiến trình và nút tua | ✅ ĐẠT |

---

## 5. Hướng Dẫn Nghiệm Thu & Vận Hành

1. **Khởi chạy máy chủ:** Nhấp đúp vào [run.bat](file:///d:/Radio/radio-vn-demo/run.bat) tại thư mục gốc.
2. **Truy cập ứng dụng:** Mở trình duyệt tại **`http://127.0.0.1:8000`**.
3. **Thao tác nhanh:**
   - Tại màn hình Auth Gate: Bấm *"Đăng Nhập Nhanh Bằng Tài Khoản Demo"*.
   - Tại Wizard Bước 1: Chạm vào thẻ *"🎮 Esports & Game"* hoặc *"🚗 Bác tài cao tốc"*, sau đó bấm *"Gửi Prompt Để AI Kiểm Tra & Duyệt"*.
   - Lần lượt qua Bước 2, Bước 3, Bước 4 và bấm *"Lưu Kênh & Bắt Đầu Nghe"*.
   - Trải nghiệm nghe phát thanh với sóng âm Canvas Visualizer sống động.
