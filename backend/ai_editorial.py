"""
ai_editorial.py - Xử lý biên tập tin tức AI & tạo kịch bản phát thanh Radio (Radio Script).
Tạo lời dẫn MC sống động, câu chào, lời chuyển đoạn (transitions) và lời kết.
"""

from datetime import datetime
import math


# Danh mục các MC AI đặc trưng với phong cách dẫn thanh
AI_VOICES_CATALOG = [
    {
        "code": "vi-VN-MinhQuan",
        "name": "MC Minh Quân",
        "gender": "Nam",
        "region": "Giọng Bắc (Hà Nội)",
        "tone_specialty": "Sôi nổi, Công nghệ, Tri thức",
        "description": "Giọng đọc truyền cảm, dứt khoát, âm vực ấm áp rất phù hợp với tin tức công nghệ và thời sự.",
        "sample_text": "Xin chào quý thính giả đang theo dõi bản tin số trên sóng Radio VN. Tôi là Minh Quân."
    },
    {
        "code": "vi-VN-ThuHa",
        "name": "MC Thu Hà",
        "gender": "Nữ",
        "region": "Giọng Bắc (Hà Nội)",
        "tone_specialty": "Trang trọng, Tài chính, Điềm đạm",
        "description": "Chất giọng thanh lịch, phát âm tròn vành rõ chữ, chuẩn phong cách phát thanh viên truyền hình.",
        "sample_text": "Kính chào quý vị thính giả. Đây là bản tin tài chính tổng hợp từ đài phát thanh Radio VN."
    },
    {
        "code": "vi-VN-TanPhat",
        "name": "MC Tấn Phát",
        "gender": "Nam",
        "region": "Giọng Nam (Sài Gòn)",
        "tone_specialty": "Vui vẻ, Thân thiện, Bác tài",
        "description": "Giọng miền Nam mộc mạc, gần gũi, hóm hỉnh như một người bạn đồng hành tin cậy trên cabin.",
        "sample_text": "A lô a lô! Tấn Phát thân chào toàn thể anh em bác tài đang lăn bánh trên mọi cung đường!"
    },
    {
        "code": "vi-VN-MaiPhuong",
        "name": "MC Mai Phương",
        "gender": "Nữ",
        "region": "Giọng Nam (Sài Gòn)",
        "tone_specialty": "Ngọt ngào, Nhẹ nhàng, Thư giãn",
        "description": "Âm sắc trong trẻo, êm dịu, nhịp đọc thư thái rất thích hợp cho podcast đêm muộn hoặc phong cách sống.",
        "sample_text": "Mai Phương mến chào quý thính giả. Mời bạn cùng lắng lại và thưởng thức những giai điệu tin tức hôm nay."
    }
]


def get_voice_info(voice_code: str) -> dict:
    """Lấy thông tin chi tiết của giọng đọc AI theo mã."""
    for voice in AI_VOICES_CATALOG:
        if voice["code"] == voice_code:
            return voice
    return AI_VOICES_CATALOG[0]


def validate_and_analyze_prompt(prompt: str) -> dict:
    """
    Giả lập AI phân tích & duyệt Prompt:
    1. Kiểm tra độ dài và ngữ nghĩa (tối thiểu 15 ký tự).
    2. Tự động nhận diện chủ đề: cong-nghe, giao-thong, kinh-doanh, the-thao, tong-hop.
    3. Tự động nhận diện phong cách tone: Vui vẻ, Trang trọng, Sôi nổi, Trầm ấm.
    4. Gợi ý tên kênh radio phù hợp nếu người dùng chưa nhập hoặc muốn tham khảo.
    """
    clean_p = prompt.strip()
    if len(clean_p) < 15:
        return {
            "valid": False,
            "message": "Prompt quá ngắn hoặc chưa đủ thông tin. Vui lòng mô tả chi tiết hơn (tối thiểu 15 ký tự, ví dụ: 'Tạo kênh tin tức Esports cập nhật giải đấu LMHT, giọng vui vẻ...')."
        }

    p_lower = clean_p.lower()

    # Nhận diện chủ đề
    if any(k in p_lower for k in ["esports", "game", "gaming", "lmht", "bóng đá", "thể thao", "marathon", "vleague", "ngoại hạng"]):
        topic = "the-thao"
        topic_label = "Thể Thao & Esports"
        default_name = "Radio Thể Thao & Esports 24/7"
    elif any(k in p_lower for k in ["bác tài", "tài xế", "giao thông", "cao tốc", "ô tô", "xe máy", "đường phố", "ùn tắc", "thời tiết"]):
        topic = "giao-thong"
        topic_label = "Giao Thông & Đời Sống Bác Tài"
        default_name = "Bản Tin Bác Tài & Nhịp Sống Cao Tốc"
    elif any(k in p_lower for k in ["chứng khoán", "bất động sản", "nhà đất", "giá vàng", "tài chính", "đầu tư", "tiền tệ", "kinh doanh", "fdi", "ngân hàng"]):
        topic = "kinh-doanh"
        topic_label = "Tài Chính & Thị Trường Đầu Tư"
        default_name = "Nhịp Đập Kinh Tế & Thị Trường Vàng"
    elif any(k in p_lower for k in ["ai", "trí tuệ nhân tạo", "công nghệ", "lập trình", "kỹ sư", "phần mềm", "bán dẫn", "startup", "code"]):
        topic = "cong-nghe"
        topic_label = "Công Nghệ & AI Số Hóa"
        default_name = "Radio Công Nghệ & AI Khởi Nghiệp"
    else:
        topic = "tong-hop"
        topic_label = "Thời Sự & Đời Sống Tổng Hợp"
        default_name = "Điểm Tin Thời Sự & Đời Sống 24/7"

    # Nhận diện phong cách tone
    if any(k in p_lower for k in ["vui vẻ", "hài hước", "hóm hỉnh", "thân thiện", "gần gũi", "dí dỏm"]):
        tone = "Vui vẻ"
    elif any(k in p_lower for k in ["trang trọng", "chuyên sâu", "chuẩn mực", "phân tích", "chính thống", "nghiêm túc"]):
        tone = "Trang trọng"
    elif any(k in p_lower for k in ["sôi nổi", "năng lượng", "nhiệt huyết", "bùng nổ", "nhanh"]):
        tone = "Sôi nổi"
    elif any(k in p_lower for k in ["trầm ấm", "thư giãn", "nhẹ nhàng", "đêm muộn", "du dương", "bình yên"]):
        tone = "Trầm ấm"
    else:
        tone = "Vui vẻ" if topic in ["giao-thong", "the-thao"] else ("Sôi nổi" if topic == "cong-nghe" else "Trang trọng")

    return {
        "valid": True,
        "message": "Prompt hợp lệ! AI đã phân tích và trích xuất ngữ cảnh thành công.",
        "inferred_topic": topic,
        "topic_label": topic_label,
        "inferred_tone": tone,
        "suggested_title": default_name,
        "summary": f"Kênh tập trung vào '{topic_label}', phong cách dẫn '{tone}'"
    }


def generate_host_intro(voice: dict, tone: str, topic: str, channel_name: str, prompt: str) -> str:
    """Tạo lời chào mở đầu của MC radio dựa theo phong cách và đối tượng thính giả."""
    mc_name = voice["name"]
    hour = datetime.now().hour

    # Lời chào theo khung giờ trong ngày
    if 5 <= hour < 11:
        time_greeting = "chào buổi sáng tốt lành"
    elif 11 <= hour < 14:
        time_greeting = "chào buổi trưa nhiều năng lượng"
    elif 14 <= hour < 18:
        time_greeting = "chào buổi chiều thảnh thơi"
    else:
        time_greeting = "lời chúc một buổi tối ấm áp và bình yên"

    if tone == "Vui vẻ":
        if "tài xế" in prompt.lower() or "bác tài" in prompt.lower() or topic == "giao-thong":
            return (
                f"A lô a lô! {mc_name} gửi {time_greeting} đến toàn thể anh em tài xế và quý thính giả đang lăn bánh trên khắp mọi nẻo đường! "
                f"Bạn đang lắng nghe kênh phát thanh '{channel_name}' độc quyền trên Radio VN. "
                f"Hôm nay hãy ngồi thật thoải mái, chỉnh lại gương chiếu hậu, bật âm lượng vừa nghe và cùng tôi cập nhật những chuyển động mới nhất nha!"
            )
        elif "esports" in prompt.lower() or "game" in prompt.lower():
            return (
                f"Chào toàn thể anh em game thủ và người yêu công nghệ! {mc_name} đã quay trở lại với sóng Radio VN rồi đây. "
                f"Chào mừng bạn đến với kênh '{channel_name}'. Hôm nay chúng ta có cực nhiều tin tức nóng sốt, cùng bắt đầu ngay thôi nào!"
            )
        else:
            return (
                f"Xin chào tất cả quý thính giả yêu quý! {mc_name} rất vui được mang đến cho bạn {time_greeting} trên làn sóng Radio VN. "
                f"Hãy hít một hơi thật sâu, thư giãn đôi vai và đồng hành cùng tôi qua bản tin '{channel_name}' ngày hôm nay nhé!"
            )

    elif tone == "Trang trọng":
        return (
            f"Kính chào quý vị thính giả. Quý vị đang theo dõi kênh phát thanh chuyên biệt '{channel_name}', "
            f"được phát sóng trực tiếp từ nền tảng phát thanh AI cá nhân hóa Radio VN. "
            f"Tôi là {mc_name}. Kính chúc quý vị một ngày làm việc hiệu quả và thịnh vượng. "
            f"Sau đây là những phân tích và điểm tin quan trọng nhất vừa được hệ thống tổng hợp."
        )

    elif tone == "Sôi nổi":
        return (
            f"Chào buổi phát sóng bùng nổ năng lượng cùng Radio VN! Tôi là {mc_name}, "
            f"rất hân hạnh được đồng hành cùng quý vị thính giả trên kênh phát thanh '{channel_name}'. "
            f"Những dòng tin tức chuyển động nhanh nhất đang chờ đón chúng ta ngay sau đây. Hãy tăng âm lượng và cùng bắt nhịp ngay bây giờ!"
        )

    else:  # Trầm ấm / Thư giãn
        return (
            f"Mến chào quý thính giả thân thương. Giữa nhịp sống vội vã, cảm ơn bạn đã dành chút thời gian lắng lại cùng '{channel_name}' trên Radio VN. "
            f"Tôi là {mc_name}. Mời bạn cùng tôi điểm qua những câu chuyện đáng chú ý nhất hôm nay."
        )


def generate_transition(index: int, tone: str, next_source: str) -> str:
    """Tạo câu nối chuyển đoạn (transition) mượt mà giữa các tin tức."""
    if tone == "Vui vẻ":
        transitions = [
            f"[SFX: Nhạc chuyển cảnh nhịp nhàng vui tươi]\nTiếp nối chương trình, một thông tin rất thú vị vừa được {next_source} chia sẻ:",
            f"[SFX: Tiếng hiệu ứng âm thanh vui nhộn]\nChưa dừng lại ở đó đâu nha thính giả ơi, trang {next_source} cũng vừa cập nhật một điểm sáng rất đáng lưu tâm:",
            f"[SFX: Nhạc lướt nhẹ]\nChuyển sang một góc nhìn đời sống tươi mới hơn trên mặt báo {next_source}:"
        ]
    elif tone == "Trang trọng":
        transitions = [
            f"[SFX: Nhạc chuyển đoạn trang trọng và tinh tế]\nChuyển sang tiêu điểm thị trường tiếp theo, ghi nhận từ nguồn tin chính thống {next_source}:",
            f"[SFX: Tiếng hiệu ứng chuông thông tin]\nMột diễn biến kinh tế và xã hội đáng chú ý khác vừa được {next_source} phân tích chuyên sâu:",
            f"[SFX: Nhạc lót trầm ổn]\nỞ một chiều không gian thông tin liên quan, bài viết mới nhất trên {next_source} cũng nhấn mạnh:"
        ]
    elif tone == "Sôi nổi":
        transitions = [
            f"[SFX: Nhạc beat điện tử chuyển cảnh hiện đại]\nNgay sau đây là cú bứt phá mới nhất được phản ánh trên {next_source}:",
            f"[SFX: Hiệu ứng âm thanh vút nhanh]\nĐừng chuyển sóng vội nhé, vì trang {next_source} vừa công bố thông tin cực 'hot' mà bạn không thể bỏ qua:",
            f"[SFX: Nhạc nền tăng nhiệt]\nTiếp tục làn sóng tin tức dồn dập, hãy cùng tôi lắng nghe điểm tin từ {next_source}:"
        ]
    else:
        transitions = [
            f"[SFX: Tiếng guitar mộc chuyển cảnh]\nKhép lại tin tức vừa rồi, mời bạn cùng lắng nghe một mẩu tin bình yên từ {next_source}:",
            f"[SFX: Nhạc piano dịu êm]\nTrên trang {next_source}, câu chuyện sau đây cũng mang đến nhiều cảm hứng suy ngẫm:",
            f"[SFX: Nhạc chuyển nhẹ nhàng]\nVà tiếp tục dòng chảy thông tin hôm nay từ {next_source}:"
        ]

    return transitions[index % len(transitions)]


def generate_host_outro(voice: dict, tone: str, topic: str, channel_name: str) -> str:
    """Tạo lời kết chào tạm biệt thính giả."""
    mc_name = voice["name"]

    if tone == "Vui vẻ":
        return (
            f"[SFX: Nhạc hiệu kết thúc chương trình tươi vui]\n"
            f"Và đó là tất cả những tin tức nổi bật nhất trong số phát thanh này của kênh '{channel_name}'. "
            f"{mc_name} xin chân thành cảm ơn quý vị thính giả và các bác tài đã luôn chọn Radio VN làm người bạn tri âm. "
            f"Chúc mọi người lái xe an toàn, làm việc sảng khoái và luôn ngập tràn niềm vui. Hẹn gặp lại quý vị ở bản tin tiếp theo nha!"
        )
    elif tone == "Trang trọng":
        return (
            f"[SFX: Nhạc hiệu kết thúc trang trọng]\n"
            f"Bản tin phân tích chuyên đề của kênh '{channel_name}' xin được khép lại tại đây. "
            f"Thay mặt ban biên tập Radio VN, tôi là {mc_name}, kính chúc quý thính giả gặt hái nhiều thành công trong các quyết định sắp tới. "
            f"Xin trân trọng cảm ơn sự theo dõi của quý vị. Kính chào tạm biệt và hẹn gặp lại."
        )
    elif tone == "Sôi nổi":
        return (
            f"[SFX: Nhạc outro tiết tấu sôi động bừng sáng]\n"
            f"Số phát thanh của '{channel_name}' hôm nay đến đây là trọn vẹn! "
            f"Tôi là {mc_name}. Hãy luôn giữ lửa đam mê, bứt phá mọi giới hạn và tiếp tục đồng hành cùng Radio VN 24/7. "
            f"Tạm biệt và hẹn gặp lại trong những nhịp sóng tiếp theo!"
        )
    else:
        return (
            f"[SFX: Nhạc êm dịu dần nhỏ]\n"
            f"Bản tin khép lại, chúc bạn một quãng thời gian thật thư thái trong tâm hồn. "
            f"{mc_name} xin gửi lời chào thân ái và hẹn gặp lại bạn trong những số phát sóng kế tiếp trên Radio VN."
        )


def estimate_reading_duration(text: str) -> int:
    """
    Ước tính thời gian đọc văn bản radio (khoảng 140 - 160 từ tiếng Việt mỗi phút).
    Cộng thêm thời gian cho các đoạn nhạc hiệu SFX (mỗi SFX khoảng 3 giây).
    """
    # Đếm số từ thực
    words = len(text.split())
    # 150 từ/phút => 2.5 từ/giây
    speech_seconds = int(words / 2.5)

    # Đếm số lần xuất hiện SFX
    sfx_count = text.count("[SFX:")
    total_seconds = speech_seconds + (sfx_count * 3)

    return max(total_seconds, 60)


def format_duration(seconds: int) -> str:
    """Định dạng giây thành chuỗi mm:ss."""
    mins = seconds // 60
    secs = seconds % 60
    return f"{mins:02d}:{secs:02d}"


def build_editorial_radio_script(
    channel_name: str,
    prompt: str,
    topic: str,
    tone: str,
    voice_code: str,
    content_type: str,
    news_items: list
) -> dict:
    """
    Toàn bộ Pipeline AI Editorial:
    1. Nhận tin tức cào được -> 2. Tóm tắt & tinh chỉnh ngôn ngữ phát thanh
    3. Thêm Station ID, Nhạc hiệu, Lời chào MC, Chuyển cảnh (Transitions) và Lời kết.
    """
    voice = get_voice_info(voice_code)

    # 1. Station ID & Nhạc hiệu mở đầu
    station_header = (
        f"[SFX: Nhạc hiệu mở đầu độc quyền Đài Phát Thanh Radio VN - Kênh AI Cá Nhân Hóa]\n"
        f"ĐÀI PHÁT THANH RADIO VN - TẦN SỐ AI 24/7\n"
        f"KÊNH: {channel_name.upper()}\n"
    )

    # 2. Lời chào của MC
    intro = generate_host_intro(voice, tone, topic, channel_name, prompt)

    # 3. Biên tập từng mục tin (Segments)
    segments = []
    script_segments_text = []

    for idx, item in enumerate(news_items):
        title = item.get("title", "")
        summary = item.get("summary", "")
        source = item.get("source", "Báo chí chính thống")

        transition_text = generate_transition(idx, tone, source)
        
        # Viết lại lời dẫn tin ngắn gọn, đối thoại tự nhiên cho phát thanh
        if tone == "Vui vẻ":
            news_speech = f"Về thông tin '{title}': {summary}"
        elif tone == "Trang trọng":
            news_speech = f"Đầu tiên là bản tin: '{title}'. Theo phân tích từ {source}, {summary}"
        else:
            news_speech = f"Tiêu điểm đáng chú ý: '{title}'. Cụ thể, {summary}"

        segment_full = f"{transition_text}\n{news_speech}\n"
        script_segments_text.append(segment_full)

        segments.append({
            "index": idx + 1,
            "headline": title,
            "source": source,
            "summary": summary,
            "transition": transition_text,
            "speech": news_speech
        })

    # 4. Lời kết của MC
    outro = generate_host_outro(voice, tone, topic, channel_name)

    # Ghép kịch bản hoàn chỉnh
    full_script = (
        f"{station_header}\n"
        f"{intro}\n\n"
        f"{''.join(script_segments_text)}\n"
        f"{outro}"
    )

    duration_sec = estimate_reading_duration(full_script)

    return {
        "channel_name": channel_name,
        "voice": voice,
        "tone": tone,
        "topic": topic,
        "station_header": station_header,
        "intro": intro,
        "segments": segments,
        "outro": outro,
        "full_script": full_script,
        "duration_seconds": duration_sec,
        "duration_formatted": format_duration(duration_sec),
        "headlines_count": len(news_items),
        "pipeline_status": {
            "step_1_crawl": "Hoàn tất thu thập nguồn tin chính thống",
            "step_2_summarize": "Đã tóm tắt nội dung báo chí qua bộ lọc tin cậy",
            "step_3_editorial": f"Đã biên tập kịch bản phát thanh giọng {voice['name']} - Phong cách {tone}",
            "step_4_audio_prep": "Kịch bản đã sẵn sàng phát sóng trên bộ giải mã âm thanh Canvas Visualizer"
        }
    }
