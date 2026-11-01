# 🤖 Ngữ Cảnh Tích Hợp Google Gemini API (AI Integration Context)

> **Tài liệu này mô tả chi tiết kỹ thuật tích hợp Google AI Studio (Gemini API) trong hệ thống Radio VN.**  
> File mã nguồn trung tâm: [backend/gemini_service.py](file:///d:/Radio/radio-vn-demo/backend/gemini_service.py).

---

## 1. Mục Tiêu & Trách Nhiệm Của Module AI
Module AI chịu trách nhiệm 3 nhiệm vụ sống còn trong hệ thống:
1. **Semantic Prompt Analysis (Bước 1):** Phân tích ngữ nghĩa của prompt tự do từ người dùng, loại bỏ hoàn toàn các cấu trúc `if/else` quét từ khóa thô sơ.
2. **Source Suggestion (Bước 2):** Đề xuất 5 đến 8 website báo chí chính thống uy tín tại Việt Nam phù hợp với chủ đề và bối cảnh của prompt.
3. **Deep Radio Script Synthesis (Bước 4):** Đóng vai Tổng Biên Tập kiêm MC Radio chuyên nghiệp, thu thập tin tức thời gian thực và biên tập bản tin phát thanh sâu sắc, dài dặn (**400 - 600+ từ**) chuẩn phong cách truyền thanh.

---

## 2. Chiến Lược Giải Quyết Tên Model (Model Candidate Strategy)

### 2.1. Vấn Đề Lịch Sử
Google AI Studio thường xuyên cập nhật vòng đời các mô hình. Các model như `gemini-1.5-flash` hoặc phiên bản thử nghiệm `gemini-2.5-flash` có thể bị thông báo:
```text
NotFound: 404 This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash or gemini-3.5-flash.
```

### 2.2. Giải Pháp Triển Khai
Hàm `get_candidate_models()` tự động sắp xếp danh sách các model chuẩn được Google hỗ trợ:
```python
def get_candidate_models() -> List[str]:
    configured = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
    candidates = []
    for m in [configured, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]:
        if m and m not in candidates and m != "gemini-1.5-flash":
            candidates.append(m)
    return candidates
```

### 2.3. Cơ Chế Thử Lại Không Trễ (Instant Retry)
Khi SDK hoặc REST API gặp lỗi `404`, `NotFound` hoặc `no longer available`, hệ thống **lập tức thử model tiếp theo** trong danh sách `candidates` mà không chờ đợi timeout 35s như trước đây.

---

## 3. Kiến Trúc Gọi Kép (Dual-Engine Pipeline)

```
                       +-----------------------+
                       |   get_active_api_key  |
                       +-----------------------+
                                   │
                                   ▼
             +───────────────────────────────────────────+
             |      ENGINE 1: google-generativeai SDK    |
             |  - Timeout: 15 giây                        |
             |  - Duyệt tuần tự candidate_models         |
             +───────────────────────────────────────────+
                                   │
                     Thành công?   ├──► [Trả về kết quả]
                                   │
                              Thất bại (SDK lỗi / gRPC nghẽn)
                                   ▼
             +───────────────────────────────────────────+
             |      ENGINE 2: Direct HTTPS REST API      |
             |  - Endpoint: generativelanguage.googleapis|
             |  - Timeout: 10 giây qua requests           |
             |  - Payload: contents & generationConfig   |
             +───────────────────────────────────────────+
                                   │
                     Thành công?   ├──► [Trả về kết quả]
                                   │
                              Mất mạng / Chưa có API Key
                                   ▼
             +───────────────────────────────────────────+
             |     LOCAL SEMANTIC FALLBACK ENGINE        |
             |  - Phân tích ngữ cảnh cục bộ (< 10ms)     |
             |  - Kịch bản mẫu mở rộng 450 từ chuẩn MC   |
             +───────────────────────────────────────────+
```

---

## 4. Đặc Tả Dữ Liệu Phân Tích Prompt (Semantic Analysis Schema)

Khi người dùng gửi prompt ở Bước 1, Gemini API được yêu cầu trả về định dạng JSON thuần túy (`responseMimeType: application/json`):

```json
{
  "is_valid": true,
  "topic_category": "the-thao",
  "topic_label": "Game Liên Quân Mobile & Esports",
  "inferred_tone": "Sôi nổi",
  "suggested_title": "Radio Esports & Game Thủ Việt 24/7",
  "feedback_message": "✅ Prompt hợp lệ! Đã xác định chủ đề tin tức Game Liên Quân Mobile & Esports.",
  "summary": "Kênh tập trung cập nhật các giải đấu Liên Quân, LMHT, meta chiến thuật và thị trường game công nghệ mới."
}
```

### Tiêu Chí Phân Loại `topic_category`:
- `cong-nghe`: AI, bán dẫn, phần mềm, thiết bị di động, chuyển đổi số.
- `giao-thong`: Cao tốc, lưu lượng xe, thời tiết mưa bão, kỹ năng lái xe, ô tô.
- `kinh-doanh`: Thị trường tài chính, chứng khoán, giá vàng, bất động sản, FDI.
- `the-thao`: Esports, bóng đá (V-League, Ngoại hạng), marathon, quần vợt.
- `tong-hop`: Thời sự xã hội, đời sống, văn hóa chung.

---

## 5. Kỹ Thuật Viết Prompt Kịch Bản Radio Sâu (400 - 600 Từ)

System Prompt của Gemini được thiết kế để ép buộc AI viết kịch bản phát thanh truyền cảm, có độ dài và cấu trúc chuyên nghiệp:

1. **Station Header & Lời Chào MC:**
   - Mở đầu bằng Station ID độc quyền: `[SFX: Nhạc hiệu mở đầu độc quyền Đài Phát Thanh Radio VN]`.
   - Lời chào của MC được điều chỉnh theo khung giờ thực tế (sáng, trưa, chiều, tối) và đối tượng người nghe (game thủ, tài xế lái xe, nhà đầu tư...).
2. **Transitions (Lời Chuyển Đoạn):**
   - Đặt các tag hiệu ứng `[SFX: Nhạc chuyển cảnh nhịp nhàng]` giữa các tin bài để tạo nhịp điệu sinh động.
3. **Phần Thân (3-4 Bản Tin Chi Tiết):**
   - Mỗi tin tức gồm: Tiêu đề rõ ràng, phân tích bối cảnh, diễn biến số liệu và góc nhìn tác động thực tế tới thính giả.
   - Không tóm tắt cụt lủn 1-2 câu mà trình bày sâu sắc từ 80 - 120 từ cho mỗi mục tin.
4. **Lời Kết (Outro):**
   - Dặn dò thính giả (lái xe an toàn, giữ gìn sức khỏe, làm việc hiệu quả) và kết thúc bằng `[SFX: Nhạc hiệu kết thúc chương trình]`.

---

## 6. Cấu Hình Biến Môi Trường (.env)

Hệ thống hỗ trợ nạp key tự động từ cả 2 vị trí:
1. Thư mục gốc: `d:\Radio\radio-vn-demo\.env`
2. Thư mục backend: `d:\Radio\radio-vn-demo\backend\.env`

Hàm `reload_env()` trong `gemini_service.py` luôn kiểm tra cả hai đường dẫn trước mỗi yêu cầu gọi AI, giúp người dùng linh hoạt đặt file cấu hình ở bất kỳ đâu.
