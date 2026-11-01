# 🎧 Thiết Kế Kỹ Thuật Audio Engine & Canvas Visualizer (Frontend Audio Context)

> **Tài liệu này mô tả chi tiết kiến trúc xử lý âm thanh số, tổng hợp giọng nói Web Speech API và kết xuất sóng âm Canvas trong ứng dụng Radio VN.**  
> File mã nguồn trung tâm: [frontend/app.js](file:///d:/Radio/radio-vn-demo/frontend/app.js) và [frontend/styles.css](file:///d:/Radio/radio-vn-demo/frontend/styles.css).

---

## 1. Tổng Quan Kiến Trúc Âm Thanh Phía Client

Hệ thống âm thanh của Radio VN được thiết kế theo nguyên tắc **Zero-Cost (Hoàn toàn miễn phí)** và **Real-time Synthesis (Tổng hợp thời gian thực)**:
1. **Web Audio API (`AudioContext`):** Tự động phát hợp âm Radio Chime Jingle 3 nốt mở đầu mỗi chương trình mà không cần tải file MP3 bên ngoài.
2. **Web Speech API (`SpeechSynthesis`):** Phát giọng đọc tiếng Việt truyền cảm, điều chỉnh cao độ (pitch) và tốc độ (rate) theo từng MC AI.
3. **Chunk Streaming Engine:** Chia nhỏ kịch bản dài 400 - 600 từ để triệt tiêu lỗi ngắt tiếng sau 15 giây của trình duyệt Chrome/Edge.
4. **HTML5 Canvas Dynamic Visualizer:** Kết xuất 28 cột sóng âm thanh đối xứng dao động theo trạng thái phát sóng.

---

## 2. Giải Pháp Khắc Phục Lỗi Timeout 15s Của Trình Duyệt

### 2.1. Vấn Đề Kỹ Thuật (Chromium Bug)
Trong các trình duyệt dựa trên nhân Chromium (Google Chrome, Microsoft Edge, Cốc Cốc, Android WebView), đối tượng `SpeechSynthesisUtterance` có một lỗi nổi tiếng:
- Nếu một đoạn văn bản dài phát liên tục quá khoảng 15 giây, sự kiện `onend` sẽ không bao giờ được kích hoạt, âm thanh bị đứng im đột ngột.
- Cơ chế Garbage Collection (GC) của trình duyệt tự động thu hồi đối tượng utterance đang chạy ngầm nếu không có tham chiếu hoạt động liên tục.

### 2.2. Thuật Toán Sentence Chunking & Heartbeat Timer
Lớp `RadioAudioEngine` trong [frontend/app.js](file:///d:/Radio/radio-vn-demo/frontend/app.js) giải quyết vấn đề bằng thuật toán phối hợp 3 tầng:

```
[Văn bản Kịch bản 400-600 từ]
            │
            ▼
[Làm sạch các tag hiệu ứng [SFX:...], KÊNH, ĐÀI PHÁT THANH]
            │
            ▼
[Regex Sentence Chunking: Bóc tách thành mảng các câu ngắn]
(regex: /[^.?!;\n]+[.?!;\n]+|[^.?!;\n]+$/g)
            │
            ▼
[Hàng Đợi Chunks] ──► [speakNextChunk()] ──► [SpeechSynthesis.speak(chunk)]
            ▲                                               │
            │              Sự kiện utterance.onend          │
            └───────────────────────────────────────────────┘
                                   │
            [Heartbeat Timer: Mỗi 9 giây ping pause/resume]
            (Ngăn chặn trình duyệt Garbage Collection thu hồi bộ nhớ)
```

```javascript
// Trích đoạn mã nguồn trong app.js
speakText(text, onEndCallback) {
  if (!this.speechSynth) return;
  this.stop();

  this.onEndCallback = onEndCallback;
  this.isSpeaking = true;

  const cleanedText = text
    .replace(/\[SFX:[^\]]+\]/g, ' ')
    .replace(/KÊNH:[^\n]+/g, ' ')
    .replace(/ĐÀI PHÁT THANH[^\n]+/g, ' ')
    .trim();

  // Chia nhỏ thành các câu/đoạn ngắn dưới 150 ký tự
  const rawChunks = cleanedText.match(/[^.?!;\n]+[.?!;\n]+|[^.?!;\n]+$/g) || [cleanedText];
  this.chunks = rawChunks.map(c => c.trim()).filter(c => c.length > 0);
  this.currentChunkIndex = 0;

  // Heartbeat định kỳ giữ cho SpeechSynthesis không bị Chrome thu hồi
  if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  this.heartbeatTimer = setInterval(() => {
    if (this.speechSynth && this.isSpeaking && !this.speechSynth.paused) {
      this.speechSynth.pause();
      this.speechSynth.resume();
    }
  }, 9000);

  this.speakNextChunk();
}
```

---

## 3. Tổng Hợp Nhạc Chuông Radio Bằng Web Audio API

Trước khi bắt đầu bài đọc, hàm `playRadioJingle()` tạo ra chuỗi 3 nốt nhạc hiệu đài phát thanh (C5 -> E5 -> G5) bằng bộ tạo dao động hình sin (*Sine Oscillator*) và bộ điều biến âm lượng (*Gain Envelope*):

```javascript
// Hợp âm Chime Radio 3 nốt: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
const notes = [523.25, 659.25, 783.99];
notes.forEach((freq, idx) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now + idx * 0.15);

  gain.gain.setValueAtTime(0, now + idx * 0.15);
  gain.gain.linearRampToValueAtTime(0.18 * state.volume, now + idx * 0.15 + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.6);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now + idx * 0.15);
  osc.stop(now + idx * 0.15 + 0.6);
});
```

---

## 4. Đặc Tả Cao Độ & Tốc Độ Giọng Đọc Của 4 MC AI

Hệ thống tự động hiệu chỉnh thông số âm học của `SpeechSynthesisUtterance` tương ứng với MC được chọn:

| Mã Giọng | Tên MC | Vùng Miền / Giới Tính | Phong Cách | Cao Độ (Pitch) | Tốc Độ Mặc Định |
|---|---|---|---|---|---|
| `vi-VN-MinhQuan` | Minh Quân | Giọng Bắc (Hà Nội) - Nam | Sôi nổi, Công nghệ, Tri thức | 0.95 (Trầm ấm) | 1.0x (Tùy chỉnh 0.8x - 1.25x) |
| `vi-VN-ThuHa` | Thu Hà | Giọng Bắc (Hà Nội) - Nữ | Trang trọng, Tài chính, Điềm đạm | 1.15 (Trong trẻo) | 1.0x (Tùy chỉnh 0.8x - 1.25x) |
| `vi-VN-TanPhat` | Tấn Phát | Giọng Nam (Sài Gòn) - Nam | Vui vẻ, Thân thiện, Bác tài | 0.92 (Gần gũi) | 1.0x (Tùy chỉnh 0.8x - 1.25x) |
| `vi-VN-MaiPhuong` | Mai Phương | Giọng Nam (Sài Gòn) - Nữ | Ngọt ngào, Nhẹ nhàng, Thư giãn | 1.18 (Dịu êm) | 0.95x |

---

## 5. Kết Xuất Sóng Âm Thanh Động Học (Canvas Visualizer)

Tại khung Album Art của Fullscreen Player, một thẻ `<canvas id="visualizerCanvas" width="220" height="42">` được điều khiển bằng vòng lặp hoạt ảnh `requestAnimationFrame`:
- **Số lượng cột sóng:** 28 thanh đối xứng (`barCount = 28`), bề rộng mỗi thanh 4px bo góc tròn `roundRect(x, y, 4, barHeight, 2)`.
- **Hàm toán học dao động:** Kết hợp sóng sin và cos kép:
  ```javascript
  const wave1 = Math.sin(phase + i * 0.3);
  const wave2 = Math.cos(phase * 1.6 + i * 0.25);
  const intensity = Math.abs(wave1 * wave2);
  barHeight = Math.max(5, intensity * (height - 6));
  ```
- **Chuyển màu Neon:** Gradient chuyển từ `#38bdf8` (Sky blue) sang `#818cf8` (Indigo).
- **Tốc độ sóng:** Tự động đồng bộ với tốc độ phát thanh: `phase += 0.08 * state.playbackSpeed`. Khi người dùng tạm dừng (*Pause*), sóng thu về trạng thái đường thẳng nằm ngang (`barHeight = 5px`).

---

## 6. Đồng Bộ Trình Phát Mini & Full-Screen Player

Trạng thái phát sóng được đồng bộ hai chiều mượt mà:
1. **Thanh tiến trình (Timeline):** Đồng hồ `fullPlayerCurrentTime` và thanh line nhỏ `miniProgressLine` cập nhật mỗi giây dựa trên bộ đếm `state.currentTime`.
2. **Nút Play/Pause:** Thay đổi biểu tượng icon Lucide tức thì trên cả Sticky Mini Player, Fullscreen Player và thẻ Card tương ứng trong danh sách kênh.
3. **Tua nhanh / Lùi 10 giây:** Hàm `seekRelative(±10)` tự động tính toán lại thời gian mà không làm gián đoạn luồng đọc.
