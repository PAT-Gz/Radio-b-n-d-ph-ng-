# 🗺️ Bản Đồ Cấu Trúc Dự Án "Radio VN" (Project Map)

> **Tài liệu này là bản đồ định vị chính thức của toàn bộ hệ thống mã nguồn dự án Radio VN.**  
> Mọi kỹ sư phần mềm và AI Coding Assistant khi thao tác thêm mới, xóa hoặc di chuyển file **BẮT BUỘC PHẢI CẬP NHẬT TÀI LIỆU NÀY NGAY LẬP TỨC**.

---

## 📌 Quy Tắc Bảo Trì Bản Đồ Dự Án (Maintenance Protocol)
1. **Nguyên tắc Đồng Bộ:** Bất kỳ file nào được tạo mới, đổi tên hoặc thay đổi cấu trúc thư mục đều phải được ghi danh vào bảng tra cứu bên dưới trong cùng một phiên làm việc.
2. **Không Tạo File Vô Danh:** Không tạo các file nháp (*temp/scratch files*) bừa bãi trong thư mục dự án mà không có giải thích mục đích trong bản đồ này.
3. **Cập Nhật Ngữ Cảnh:** Khi tạo một module lớn mới, cần tạo file tài liệu tương ứng trong thư mục `contexts/` và liên kết trong `map.md`.

---

## 🌳 Cây Thư Mục Toàn Diện (Directory Tree)

```
d:/Radio/radio-vn-demo/
│
├── .env                                # [Root] Biến môi trường hệ thống (GEMINI_API_KEY, GEMINI_MODEL)
├── .env.example                        # [Root] Bản mẫu cấu hình biến môi trường chuẩn
├── .gitignore                          # [Root] Khai báo các file bỏ qua không commit Git (.env, cache, db)
├── README.md                           # [Root] Tài liệu hướng dẫn tổng quan & kiến trúc hệ thống
├── project_rules.md                    # [Root] Quy chuẩn kỹ thuật, ràng buộc công nghệ & nguyên tắc lập trình
├── map.md                              # [Root] Bản đồ định vị file và thư mục (File này)
├── run.bat                             # [Root] Script batch 1-click khởi chạy FastAPI và mở trình duyệt
│
├── backend/                            # Thư mục mã nguồn Backend (Python FastAPI)
│   ├── .env                            # File cấu hình môi trường riêng của backend
│   ├── .env.example                    # File mẫu cấu hình môi trường backend
│   ├── .gitignore                      # Gitignore riêng của backend
│   ├── main.py                         # File thực thi chính của FastAPI, định tuyến REST API & Mount Frontend
│   ├── gemini_service.py               # Module tích hợp Google Gemini AI (Semantic validation, kịch bản 400-600 từ)
│   ├── crawler.py                      # Module cào tin tức báo chí & kiểm duyệt Whitelist tên miền .vn
│   ├── ai_editorial.py                 # Module danh bạ giọng đọc AI MC, lời chào và âm thanh truyền thanh
│   ├── database.py                     # Module quản lý cơ sở dữ liệu SQLite, tạo bảng và seed dữ liệu mẫu
│   ├── radio_vn.db                     # File cơ sở dữ liệu SQLite cục bộ chứa users, channels, broadcasts
│   └── requirements.txt                # Danh sách thư viện Python cần thiết (fastapi, uvicorn, requests, ...)
│
├── frontend/                           # Thư mục mã nguồn Giao diện (Mobile App Prototype)
│   ├── index.html                      # Cấu trúc HTML5 chuẩn Mobile Viewport (390px x 844px), Wizard & Players
│   ├── styles.css                      # Định kiểu CSS, hiệu ứng kính Glassmorphism, Neon glow & Equalizer
│   └── app.js                          # Bộ não Frontend: State store, Web Audio/Speech engine, Canvas visualizer
│
├── contexts/                           # Thư mục lưu trữ Ngữ cảnh Kiến trúc & Quyết định Kỹ thuật (ADR)
│   ├── architecture_decisions.md       # Ghi nhận các quyết định kiến trúc (ADR) & so sánh công nghệ
│   ├── gemini_integration.md           # Ngữ cảnh tích hợp Gemini API, danh sách model ứng viên & prompt engineering
│   ├── frontend_audio_engine.md        # Thiết kế kỹ thuật Audio Engine: Sentence chunking & Canvas visualizer
│   └── database_schema.md              # Lược đồ cơ sở dữ liệu chi tiết, bảng, trường và chỉ mục SQLite
│
└── deliverables/                       # Thư mục chứa Sản phẩm Bàn giao, Biên bản & Release Notes
    ├── README.md                       # Hướng dẫn đóng gói và quản lý sản phẩm bàn giao
    └── release_notes_v1.0.md           # Biên bản bàn giao phiên bản Prototype v1.0 Mobile App
```

---

## 📋 Bảng Tra Cứu Trách Nhiệm Chi Tiết Của Từng File

| File / Thư Mục | Vị Trí Đường Dẫn | Vai Trò Kiến Trúc | Chức Năng Cốt Lõi | Các File Liên Quan |
|---|---|---|---|---|
| **run.bat** | `/run.bat` | Script Tự Động Hóa | Tự động chuyển vào thư mục backend, chạy Uvicorn server tại port 8000 và mở trình duyệt web. | `backend/main.py` |
| **README.md** | `/README.md` | Tài Liệu Trung Tâm | Hướng dẫn tổng quan dự án, kiến trúc hệ thống, kiến trúc module frontend và phân tích các luồng nghiệp vụ cốt lõi. | Mọi file |
| **project_rules.md** | `/project_rules.md` | Quy Chuẩn Kỹ Thuật | Định nghĩa ràng buộc công nghệ, tiêu chuẩn code sạch, quy tắc bảo mật API key và quy ước xử lý âm thanh. | Mọi file |
| **map.md** | `/map.md` | Bản Đồ Định Vị | Sơ đồ cây thư mục và bảng tra cứu chức năng của từng file trong dự án. | Mọi file |
| **.env / .env.example** | `/.env` & `backend/.env` | Cấu Hình Môi Trường | Lưu trữ `GEMINI_API_KEY`, `GEMINI_MODEL`, `PORT`. Không commit file chứa key thật lên Git. | `backend/gemini_service.py` |
| **main.py** | `backend/main.py` | REST API Gateway | Khởi tạo FastAPI app, cấu hình CORS, định nghĩa endpoints (`/api/auth/*`, `/api/channels/*`, `/api/sources/*`, `/api/ai/*`), mount thư mục static `frontend/`. | `backend/gemini_service.py`, `backend/database.py`, `backend/crawler.py` |
| **gemini_service.py** | `backend/gemini_service.py` | AI Core Service | Phân tích ngữ nghĩa prompt (Semantic Analysis), đề xuất nguồn báo, biên tập kịch bản radio sâu 400-600 từ bằng Gemini AI, cơ chế multi-model fallback (`gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-3.8-flash`). | `backend/main.py`, `.env` |
| **database.py** | `backend/database.py` | Data Access Layer | Khởi tạo bảng SQLite (`users`, `channels`, `broadcasts`), mã hóa mật khẩu SHA256, thực thi CRUD cho người dùng và kênh radio, seed dữ liệu mẫu ban đầu. | `backend/radio_vn.db`, `backend/main.py` |
| **crawler.py** | `backend/crawler.py` | Ingestion & Whitelist | Duyệt Whitelist các tên miền báo chính thống Việt Nam (.vn), bóc tách nội dung tin tức đa nguồn và kiểm tra an toàn tên miền. | `backend/main.py`, `backend/gemini_service.py` |
| **ai_editorial.py** | `backend/ai_editorial.py` | Radio Sound Design | Định nghĩa danh bạ 4 MC AI (Minh Quân, Thu Hà, Tấn Phát, Mai Phương), mẫu câu chào khung giờ, lời kết và ước lượng thời lượng đọc phát thanh. | `backend/main.py`, `backend/gemini_service.py` |
| **radio_vn.db** | `backend/radio_vn.db` | Cơ Sở Dữ Liệu | Database SQLite cục bộ lưu trữ vĩnh viễn danh sách tài khoản người dùng, cấu hình kênh và các số phát thanh đã tạo. | `backend/database.py` |
| **requirements.txt** | `backend/requirements.txt` | Quản Lý Thư Viện | Khai báo các gói thư viện Python cần thiết (`fastapi`, `uvicorn`, `pydantic`, `requests`, `beautifulsoup4`, `python-dotenv`, `google-generativeai`). | Môi trường Python |
| **index.html** | `frontend/index.html` | Giao Diện Người Dùng | Cấu trúc màn hình chuẩn Mobile Viewport (390x844px), Auth Gate screen, Top App Bar với Dynamic Island, 4-Step Creation Wizard Modal, Mini Player và Fullscreen Audio Player. | `frontend/styles.css`, `frontend/app.js` |
| **styles.css** | `frontend/styles.css` | Thiết Kế Giao Diện | CSS tùy biến phông chữ Plus Jakarta Sans, hiệu ứng kính Glassmorphism, viền phát sáng Neon Glow, hoạt ảnh đĩa than xoay tròn và thanh Equalizer. | `frontend/index.html` |
| **app.js** | `frontend/app.js` | Bộ Não Logic Frontend | Quản lý state tập trung, xử lý gọi REST API, Web Speech API sentence chunking, Web Audio chime synthesis, Canvas visualizer rendering và điều khiển chuyển màn hình. | `frontend/index.html`, `backend/main.py` |
| **architecture_decisions.md** | `contexts/architecture_decisions.md` | Hồ Sơ Quyết Định | Ghi nhận lý do chọn FastAPI, SQLite, Vanilla JS và Web Speech API thay vì các giải pháp thay thế. | `README.md`, `project_rules.md` |
| **gemini_integration.md** | `contexts/gemini_integration.md` | Tài Liệu Kỹ Thuật AI | Giải thích chi tiết cơ chế Semantic Prompt Analysis, danh sách model tương thích và mẫu prompt biên tập radio. | `backend/gemini_service.py` |
| **frontend_audio_engine.md** | `contexts/frontend_audio_engine.md` | Tài Liệu Kỹ Thuật Âm Thanh | Cơ chế chunk streaming chống lỗi 15s của trình duyệt, thuật toán heartbeat timer và bộ vẽ sóng âm Canvas. | `frontend/app.js` |
| **database_schema.md** | `contexts/database_schema.md` | Lược Đồ Dữ Liệu | Cấu trúc chi tiết các bảng `users`, `channels`, `broadcasts`, khóa chính, khóa ngoại và chỉ mục trong SQLite. | `backend/database.py` |
| **release_notes_v1.0.md** | `deliverables/release_notes_v1.0.md` | Biên Bản Bàn Giao | Báo cáo chi tiết các tính năng hoàn thành trong phiên bản v1.0 Mobile Prototype. | Toàn dự án |

---

## 🔍 Nơi Tìm Thấy Các Tài Nguyên Quan Trọng

- **Khởi chạy ứng dụng:** Mở thư mục gốc và nhấp đúp vào [run.bat](file:///d:/Radio/radio-vn-demo/run.bat).
- **Cấu hình Gemini API Key:** Chỉnh sửa file [.env](file:///d:/Radio/radio-vn-demo/.env) ở thư mục gốc hoặc [backend/.env](file:///d:/Radio/radio-vn-demo/backend/.env).
- **Thay đổi logic gọi AI:** Kiểm tra và chỉnh sửa tại [backend/gemini_service.py](file:///d:/Radio/radio-vn-demo/backend/gemini_service.py).
- **Thay đổi giao diện người dùng:** Chỉnh sửa cấu trúc tại [frontend/index.html](file:///d:/Radio/radio-vn-demo/frontend/index.html) và logic tương tác tại [frontend/app.js](file:///d:/Radio/radio-vn-demo/frontend/app.js).
- **Xem dữ liệu đã lưu:** Mở file [backend/radio_vn.db](file:///d:/Radio/radio-vn-demo/backend/radio_vn.db) bằng công cụ DB Browser for SQLite hoặc SQLite Viewer.
- **Xem quyết định kiến trúc:** Xem các tài liệu trong thư mục [contexts/](file:///d:/Radio/radio-vn-demo/contexts).
