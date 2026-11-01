"""
main.py - FastAPI Backend cho dự án Demo "Radio VN - Kênh Phát Thanh AI Cá Nhân Hóa".
Cung cấp RESTful API cho xác thực, quản lý kênh, kiểm tra Whitelist, cào tin và AI Editorial.
"""

import os
import sys
from pathlib import Path
from typing import List, Optional

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from dotenv import load_dotenv

# Tìm và nạp file .env từ cả thư mục backend/ lẫn thư mục gốc dự án
env_paths = [
    Path(__file__).resolve().parent / ".env",
    Path(__file__).resolve().parent.parent / ".env"
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)

# 1. Đọc cả 2 biến môi trường từ file .env bằng python-dotenv
# 2. Thay thế tất cả các đoạn hardcode tên model cũ bằng biến os.getenv("GEMINI_MODEL") (Mặc định 'gemini-1.5-flash')
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()

# 3. Đảm bảo cấu hình timeout cho các request gọi Gemini API tối thiểu là 15 giây
GEMINI_TIMEOUT = max(15, int(os.getenv("GEMINI_TIMEOUT", "15")))  # Cấu hình tối thiểu 15s


import database
import crawler
import ai_editorial
import gemini_service

# Đồng bộ cấu hình model và timeout sang gemini_service
gemini_service.GEMINI_MODEL = GEMINI_MODEL
gemini_service.GEMINI_TIMEOUT = GEMINI_TIMEOUT

# Khởi tạo cơ sở dữ liệu khi khởi động
database.init_db()

app = FastAPI(
    title="Radio VN - AI Personalized Radio API",
    description="Backend API cho nền tảng phát thanh tin tức AI cá nhân hóa Radio VN",
    version="1.0.0"
)

# Cấu hình CORS để Frontend gọi API thuận tiện từ mọi nguồn (localhost, 127.0.0.1, file://)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thư mục Frontend
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ==========================================
# PYDANTIC SCHEMAS (DATA TRANSFER OBJECTS)
# ==========================================

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=4)
    full_name: Optional[str] = "Thính Giả Radio VN"


class LoginRequest(BaseModel):
    username: str
    password: str


class DomainCheckRequest(BaseModel):
    url: str


class ChannelCreateRequest(BaseModel):
    user_id: Optional[int] = 1
    name: str = Field(..., min_length=2)
    prompt: str = Field(..., min_length=3)
    topic: str = "cong-nghe"
    tone: str = "Vui vẻ"
    content_type: str = "continuous"  # continuous | podcast | quick
    sources: List[str] = []
    broadcast_mode: str = "live"       # live | podcast | schedule
    voice_code: str = "vi-VN-MinhQuan"
    voice_name: str = "Minh Quân (Nam - Giọng Bắc)"


class EditorialPreviewRequest(BaseModel):
    name: str = "Kênh Tin Tức Mới"
    prompt: str
    topic: str = "cong-nghe"
    tone: str = "Vui vẻ"
    voice_code: str = "vi-VN-MinhQuan"
    content_type: str = "continuous"
    sources: List[str] = []


class PromptValidationRequest(BaseModel):
    prompt: str


# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    """Đăng ký tài khoản người dùng mới."""
    existing = database.get_user_by_username(req.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập đã được sử dụng. Vui lòng chọn tên khác."
        )

    user = database.create_user(req.username, req.email, req.password, req.full_name)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tạo tài khoản lúc này."
        )

    return {
        "success": True,
        "message": "Đăng ký tài khoản thành công!",
        "user": user,
        "token": f"mock_token_{user['id']}_{user['username']}"
    }


@app.post("/api/auth/login")
def login(req: LoginRequest):
    """Đăng nhập và trả về phiên làm việc."""
    user = database.verify_user(req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác."
        )

    return {
        "success": True,
        "message": "Đăng nhập thành công!",
        "user": user,
        "token": f"mock_token_{user['id']}_{user['username']}"
    }


@app.get("/api/auth/me")
def get_current_user(user_id: int = Query(default=1)):
    """Lấy thông tin tài khoản hiện tại."""
    user = database.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại.")
    return {"user": user}


# ==========================================
# CRAWLER & WHITELIST ENDPOINTS
# ==========================================

@app.get("/api/sources/suggest")
def get_suggested_sources(topic: str = Query(default="cong-nghe"), prompt: str = Query(default="")):
    """
    Lấy danh sách các trang báo gợi ý theo chủ đề & prompt bằng Gemini AI,
    tự động đề xuất 5-8 nguồn báo chính thống và kiểm tra Whitelist sẵn.
    """
    sources = gemini_service.suggest_sources_with_gemini(topic, prompt)
    enriched = []
    for s in sources:
        domain = s.get("domain", "")
        check = crawler.check_domain_whitelist(domain)
        enriched.append({
            **s,
            "whitelist_info": check
        })
    return {"topic": topic, "sources": enriched}


@app.post("/api/sources/check-domain")
def verify_domain_whitelist(req: DomainCheckRequest):
    """Kiểm tra URL người dùng nhập vào có thuộc Whitelist báo chí uy tín hay không."""
    if not req.url or len(req.url.strip()) < 3:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp URL hợp lệ.")
    
    result = crawler.check_domain_whitelist(req.url)
    return result


@app.get("/api/voices")
def get_voices():
    """Lấy danh sách các giọng đọc AI Tiếng Việt được cấu hình."""
    return {"voices": ai_editorial.AI_VOICES_CATALOG}


@app.post("/api/ai/validate-prompt")
def validate_prompt(req: PromptValidationRequest):
    """
    Phân tích ngữ nghĩa Semantic Analysis & duyệt Prompt bằng Google Gemini API.
    Loại bỏ hoàn toàn các đoạn code if/else hardcode.
    """
    return gemini_service.validate_prompt_with_gemini(req.prompt)


# ==========================================
# AI EDITORIAL PREVIEW (WIZARD BƯỚC 4 & API GENERATE-SCRIPT)
# ==========================================

def _generate_editorial_script_helper(req: EditorialPreviewRequest):
    """
    Hàm lõi sinh kịch bản phát thanh AI chuyên nghiệp bằng Gemini:
    - Thu thập tin tức thời gian thực từ các nguồn được chọn.
    - Mở rộng độ dài kịch bản từ 400 - 600 từ với đầy đủ 4 phần:
      1. Lời chào & Giới thiệu kênh độc đáo từ MC (với Station ID & SFX).
      2. Lời dẫn chuyển đoạn (Transitions) mượt mà.
      3. 3-4 tin tức nổi bật phân tích chuyên sâu, đa chiều.
      4. Lời kết dặn dò thính giả & Outro.
    """
    # 1. Thu thập tin tức liên quan từ nguồn báo
    news_items = crawler.crawl_news_from_sources(
        sources_list=req.sources if req.sources else [req.topic],
        topic=req.topic,
        prompt=req.prompt,
        max_total_items=4
    )

    voice_info = ai_editorial.get_voice_info(req.voice_code)

    # 2. Biên tập kịch bản phát thanh AI chuyên sâu bằng Gemini
    editorial_result = gemini_service.generate_deep_editorial_script(
        channel_name=req.name,
        prompt=req.prompt,
        topic=req.topic,
        tone=req.tone,
        voice_info=voice_info,
        sources=req.sources,
        crawled_news=news_items
    )

    return {
        "success": True,
        "preview": editorial_result,
        "crawled_news": news_items
    }


@app.post("/api/ai/editorial-preview")
def preview_ai_editorial(req: EditorialPreviewRequest):
    """Endpoint biên tập kịch bản cho Wizard Bước 4."""
    return _generate_editorial_script_helper(req)


@app.post("/api/generate-script")
def generate_script_api(req: EditorialPreviewRequest):
    """Endpoint chuẩn /api/generate-script theo yêu cầu kỹ thuật."""
    return _generate_editorial_script_helper(req)


# ==========================================
# CHANNELS & BROADCASTS ENDPOINTS
# ==========================================

@app.get("/api/channels")
def list_channels(user_id: int = Query(default=1)):
    """Lấy danh sách các kênh radio của người dùng."""
    channels = database.get_user_channels(user_id)
    return {"channels": channels}


@app.post("/api/channels", status_code=status.HTTP_201_CREATED)
def create_channel(req: ChannelCreateRequest):
    """
    Tạo kênh phát thanh mới từ Wizard:
    1. Lưu thông tin kênh vào DB
    2. Tự động chạy Pipeline cào tin & sinh bản tin phát sóng đầu tiên
    """
    # Tạo kênh trong DB
    channel = database.create_channel(
        user_id=req.user_id or 1,
        name=req.name,
        prompt=req.prompt,
        topic=req.topic,
        tone=req.tone,
        content_type=req.content_type,
        sources=req.sources,
        broadcast_mode=req.broadcast_mode,
        voice_code=req.voice_code,
        voice_name=req.voice_name
    )

    # Thu thập tin tức theo nguồn đã cấu hình
    news_items = crawler.crawl_news_from_sources(
        sources_list=req.sources if req.sources else [req.topic],
        topic=req.topic,
        prompt=req.prompt,
        max_total_items=4
    )

    voice_info = ai_editorial.get_voice_info(req.voice_code)

    # Sinh kịch bản số phát sóng đầu tiên sâu sắc, dài dặn (400-600 từ) bằng Gemini
    editorial_result = gemini_service.generate_deep_editorial_script(
        channel_name=req.name,
        prompt=req.prompt,
        topic=req.topic,
        tone=req.tone,
        voice_info=voice_info,
        sources=req.sources,
        crawled_news=news_items
    )

    # Lưu bản tin vào DB
    broadcast = database.create_broadcast(
        channel_id=channel["id"],
        title=f"Số Ra Mắt - {req.name}",
        script_text=editorial_result["full_script"],
        duration_est=editorial_result["duration_seconds"],
        headlines=news_items
    )

    return {
        "success": True,
        "message": f"Kênh '{req.name}' đã được khởi tạo thành công!",
        "channel": channel,
        "broadcast": broadcast
    }


@app.get("/api/channels/{channel_id}")
def get_channel_detail(channel_id: int):
    """Lấy chi tiết kênh và bản tin phát thanh mới nhất."""
    channel = database.get_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại.")
    
    latest_broadcast = database.get_latest_broadcast(channel_id)
    return {
        "channel": channel,
        "latest_broadcast": latest_broadcast
    }


@app.delete("/api/channels/{channel_id}")
def delete_channel(channel_id: int, user_id: int = Query(default=1)):
    """Xóa kênh phát thanh."""
    success = database.delete_channel(channel_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại hoặc bạn không có quyền xóa.")
    return {"success": True, "message": "Đã xóa kênh thành công."}


@app.post("/api/channels/{channel_id}/generate-broadcast")
def generate_fresh_broadcast(channel_id: int):
    """Làm mới bản tin cho kênh: Cào lại tin tức thời gian thực và sinh kịch bản phát sóng mới bằng Gemini."""
    channel = database.get_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại.")

    news_items = crawler.crawl_news_from_sources(
        sources_list=channel.get("sources", []),
        topic=channel.get("topic", "cong-nghe"),
        prompt=channel.get("prompt", ""),
        max_total_items=4
    )

    voice_info = ai_editorial.get_voice_info(channel.get("voice_code", "vi-VN-MinhQuan"))

    editorial_result = gemini_service.generate_deep_editorial_script(
        channel_name=channel["name"],
        prompt=channel["prompt"],
        topic=channel["topic"],
        tone=channel["tone"],
        voice_info=voice_info,
        sources=channel.get("sources", []),
        crawled_news=news_items
    )

    broadcast = database.create_broadcast(
        channel_id=channel["id"],
        title=f"Bản Tin Trực Tiếp 24/7 - {channel['name']}",
        script_text=editorial_result["full_script"],
        duration_est=editorial_result["duration_seconds"],
        headlines=news_items
    )

    return {
        "success": True,
        "message": "Đã cập nhật bản tin phát thanh trực tiếp mới nhất bằng Gemini AI!",
        "broadcast": broadcast
    }


@app.get("/api/health")
def health_check():
    """Kiểm tra tình trạng hoạt động của hệ thống và kết nối Gemini API."""
    current_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    return {
        "status": "healthy",
        "service": "Radio VN AI Studio API",
        "gemini_model": current_model,
        "gemini_timeout_sec": GEMINI_TIMEOUT,
        "database": "SQLite Connected",
        "crawler": "Ready",
        "gemini_ai": f"Connected (Active - Model: {current_model}, Timeout: {GEMINI_TIMEOUT}s)" if gemini_service.is_gemini_configured() else "Fallback Engine (Set GEMINI_API_KEY in .env)"
    }


# ==========================================
# STATIC FILES SERVING (FRONTEND)
# ==========================================
if FRONTEND_DIR.exists():
    # Mount frontend files at root to serve index.html, app.js, styles.css seamlessly
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

