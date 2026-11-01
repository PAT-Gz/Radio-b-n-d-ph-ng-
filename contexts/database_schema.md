# 🗄️ Lược Đồ Cơ Sở Dữ Liệu SQLite (Database Schema Context)

> **Tài liệu này mô tả chi tiết thiết kế các bảng dữ liệu, trường thông tin, quan hệ và cơ chế lưu trữ của dự án Radio VN.**  
> File mã nguồn trung tâm: [backend/database.py](file:///d:/Radio/radio-vn-demo/backend/database.py).  
> Tệp cơ sở dữ liệu: `backend/radio_vn.db`.

---

## 1. Cấu Hình Cơ Sở Dữ Liệu SQLite

- **Định dạng:** SQLite 3 (`radio_vn.db`).
- **Khóa ngoại (Foreign Keys):** Bắt buộc kích hoạt `PRAGMA foreign_keys = ON` cho mọi kết nối để đảm bảo tính toàn vẹn tham chiếu.
- **Row Factory:** Cấu hình `conn.row_factory = sqlite3.Row` cho phép truy xuất dữ liệu theo tên cột như Dictionary trong Python.
- **Tự động Khởi tạo:** Hàm `init_db()` được gọi tự động khi máy chủ FastAPI khởi động, tự tạo bảng nếu chưa có và tự nạp dữ liệu mẫu ban đầu (Seed Data).

---

## 2. Sơ Đồ Quan Hệ Thực Thể (Entity Relationship Diagram - ERD)

```
+-----------------------------------+
|               users               |
+-----------------------------------+
| PK  id             INTEGER        |
|     username       TEXT (UNIQUE)  |
|     email          TEXT           |
|     password_hash  TEXT           |
|     full_name      TEXT           |
|     created_at     TEXT           |
+-----------------------------------+
                  │ 1
                  │
                  │ có nhiều (1:N)
                  ▼ N
+-----------------------------------+
|             channels              |
+-----------------------------------+
| PK  id             INTEGER        |
| FK  user_id        INTEGER        | ──► Tham chiếu users(id) ON DELETE CASCADE
|     name           TEXT           |
|     prompt         TEXT           |
|     topic          TEXT           |
|     tone           TEXT           |
|     content_type   TEXT           |
|     sources_json   TEXT (JSON)    |
|     broadcast_mode TEXT           |
|     voice_code     TEXT           |
|     voice_name     TEXT           |
|     created_at     TEXT           |
+-----------------------------------+
                  │ 1
                  │
                  │ có nhiều số phát sóng (1:N)
                  ▼ N
+-----------------------------------+
|            broadcasts             |
+-----------------------------------+
| PK  id             INTEGER        |
| FK  channel_id     INTEGER        | ──► Tham chiếu channels(id) ON DELETE CASCADE
|     title          TEXT           |
|     script_text    TEXT           |
|     duration_est   INTEGER        |
|     headlines_json TEXT (JSON)    |
|     created_at     TEXT           |
+-----------------------------------+
```

---

## 3. Đặc Tả Chi Tiết Các Bảng Dữ Liệu

### 3.1. Bảng `users` (Người dùng)
Lưu thông tin tài khoản thính giả, phục vụ cho luồng Authentication Gate và phân quyền sở hữu kênh.

| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc | Mô Tả |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã định danh duy nhất của người dùng |
| `username` | TEXT | UNIQUE NOT NULL | Tên đăng nhập (tối thiểu 3 ký tự) |
| `email` | TEXT | NOT NULL | Địa chỉ email liên hệ |
| `password_hash` | TEXT | NOT NULL | Mật khẩu đã được băm SHA-256 kèm salt bí mật |
| `full_name` | TEXT | DEFAULT 'Thính Giả Radio VN' | Tên hiển thị của người dùng |
| `created_at` | TEXT | NOT NULL | Thời điểm đăng ký (ISO 8601 string) |

### 3.2. Bảng `channels` (Kênh phát thanh AI)
Lưu cấu hình chi tiết của từng kênh radio do người dùng tạo qua Wizard 4 bước.

| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc | Mô Tả |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã định danh duy nhất của kênh phát thanh |
| `user_id` | INTEGER | NOT NULL, FK -> users(id) | Mã người sở hữu kênh |
| `name` | TEXT | NOT NULL | Tên kênh phát thanh (do người dùng đặt hoặc AI gợi ý) |
| `prompt` | TEXT | NOT NULL | Yêu cầu prompt tự do của người dùng |
| `topic` | TEXT | DEFAULT 'cong-nghe' | Phân loại chủ đề (`cong-nghe`, `giao-thong`, `kinh-doanh`, `the-thao`, `tong-hop`) |
| `tone` | TEXT | DEFAULT 'Vui vẻ' | Phong cách MC (`Vui vẻ`, `Trang trọng`, `Sôi nổi`, `Trầm ấm`) |
| `content_type` | TEXT | DEFAULT 'continuous' | Kiểu nội dung (`continuous`, `podcast`, `quick`) |
| `sources_json` | TEXT | DEFAULT '[]' | Chuỗi JSON chứa mảng danh sách tên nguồn báo chí đã chọn |
| `broadcast_mode`| TEXT | DEFAULT 'live' | Hình thức phát sóng (`live` 24/7, `schedule` khung giờ, `podcast`) |
| `voice_code` | TEXT | DEFAULT 'vi-VN-MinhQuan' | Mã định danh giọng đọc MC AI |
| `voice_name` | TEXT | NOT NULL | Tên hiển thị của MC kèm vùng miền và giới tính |
| `created_at` | TEXT | NOT NULL | Thời điểm khởi tạo kênh |

### 3.3. Bảng `broadcasts` (Số phát sóng)
Lưu các bản tin phát thanh đã được AI biên tập tương ứng với từng kênh.

| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc | Mô Tả |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã định danh duy nhất của số phát sóng |
| `channel_id` | INTEGER | NOT NULL, FK -> channels(id)| Mã kênh phát thanh tương ứng |
| `title` | TEXT | NOT NULL | Tiêu đề số phát sóng (ví dụ: "Số Ra Mắt - Kênh Công Nghệ") |
| `script_text` | TEXT | NOT NULL | Toàn bộ nội dung kịch bản phát thanh hoàn chỉnh (400 - 600 từ) |
| `duration_est` | INTEGER | DEFAULT 180 | Thời lượng ước tính để đọc hết bản tin (tính bằng giây) |
| `headlines_json`| TEXT | DEFAULT '[]' | Chuỗi JSON chứa mảng các bản tin con (tiêu đề, nguồn, tóm tắt) |
| `created_at` | TEXT | NOT NULL | Thời điểm sinh kịch bản phát sóng |

---

## 4. Dữ Liệu Mẫu Khởi Tạo Ban Đầu (Seed Data)

Khi khởi tạo cơ sở dữ liệu lần đầu, hàm `seed_initial_data()` tự động tạo:
1. **Tài Khoản Mẫu (Demo User):**
   - Username: `demo_user`
   - Password: `demo_password` (Mã hóa SHA-256)
   - Email: `demo@radiovn.ai`
   - Họ và tên: `Thính Giả Demo`
2. **3 Kênh Phát Thanh Chuẩn Chất Lượng Cao:**
   - **Kênh 1:** *Radio Công Nghệ & Khởi Nghiệp AI 24/7* (Chủ đề `cong-nghe`, MC Minh Quân, phong cách Sôi nổi, Live 24/7).
   - **Kênh 2:** *Bản Tin Bác Tài & Cung Đường Cao Tốc* (Chủ đề `giao-thong`, MC Tấn Phát, phong cách Vui vẻ, Live 24/7).
   - **Kênh 3:** *Điểm Tin Thị Trường Tài Chính & BĐS* (Chủ đề `kinh-doanh`, MC Thu Hà, phong cách Trang trọng, Podcast On-Demand).

---

## 5. Các Câu Truy Vấn Cốt Lõi (Core Queries)

```python
# Lấy danh sách kênh của một người dùng (kèm sắp xếp mới nhất lên đầu)
SELECT * FROM channels WHERE user_id = ? ORDER BY id DESC;

# Lấy số phát thanh mới nhất của một kênh
SELECT * FROM broadcasts WHERE channel_id = ? ORDER BY id DESC LIMIT 1;

# Xóa kênh và tự động xóa các số phát sóng phụ thuộc qua FOREIGN KEY ON DELETE CASCADE
DELETE FROM channels WHERE id = ? AND user_id = ?;
```
