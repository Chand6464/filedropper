"""
Discord Bot Bridge for Chand's Cross-Device File Dropper
=========================================================
Host this Python script on any cloud host (Render, Railway, Fly.io, Replit, VPS, or your local machine).

This bot listens on an HTTP port for secure server-to-server file relays from your Cross-Device
transfer app, verifies a secret token, and posts the incoming files directly to your Discord channel.

SECURITY GUARANTEE:
- Public visitors and browser DevTools inspects will NEVER see this bot's endpoint or token.
- Only your app's backend server sends files to this bot using a secret Bearer token in the headers.
- Any request without the valid secret token is rejected with HTTP 401.

REQUIREMENTS:
    pip install discord.py aiohttp
"""

import os
import io
import sys
from aiohttp import web
import discord
from discord.ext import commands

# -------------------------------------------------------------
# Configuration (Set these in your hosting environment variables)
# -------------------------------------------------------------
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
DISCORD_CHANNEL_ID = int(os.environ.get("DISCORD_CHANNEL_ID", "0"))
DISCORD_BOT_SECRET = os.environ.get("DISCORD_BOT_SECRET", "MY_SUPER_SECRET_TOKEN_123")
PORT = int(os.environ.get("PORT", "8080"))

# Discord Bot Setup
intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)

# -------------------------------------------------------------
# HTTP Server (Receives files securely from your web app server)
# -------------------------------------------------------------
http_app = web.Application()

def verify_auth(request: web.Request) -> bool:
    """Verifies that the incoming request has the correct secret token."""
    auth_header = request.headers.get("Authorization", "")
    secret_header = request.headers.get("X-Bot-Secret", "")
    
    expected_bearer = f"Bearer {DISCORD_BOT_SECRET}"
    if auth_header == expected_bearer or secret_header == DISCORD_BOT_SECRET:
        return True
    return False

async def handle_receive_file(request: web.Request):
    """Secure endpoint that receives a file multipart and uploads it to Discord."""
    if not verify_auth(request):
        print("[Security Alert] Rejected unauthorized request to /api/receive-file")
        return web.json_response({"error": "Unauthorized: Invalid secret token"}, status=401)

    if not bot.is_ready():
        return web.json_response({"error": "Discord bot is still logging in to Discord..."}, status=503)

    if DISCORD_CHANNEL_ID == 0:
        return web.json_response({"error": "DISCORD_CHANNEL_ID is not configured in Python bot env"}, status=500)

    channel = bot.get_channel(DISCORD_CHANNEL_ID)
    if not channel:
        try:
            channel = await bot.fetch_channel(DISCORD_CHANNEL_ID)
        except Exception as e:
            return web.json_response({"error": f"Channel {DISCORD_CHANNEL_ID} not accessible: {e}"}, status=404)

    try:
        reader = await request.multipart()
        file_bytes = None
        file_name = "received_file.bin"
        uploader = "Cross-Device Client"
        room_code = "UNKNOWN"
        mime_type = "application/octet-stream"

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "file":
                file_name = part.filename or file_name
                file_bytes = await part.read(decode=False)
            elif part.name == "uploader":
                uploader = (await part.text()).strip()
            elif part.name == "roomCode":
                room_code = (await part.text()).strip()
            elif part.name == "mimeType":
                mime_type = (await part.text()).strip()

        if not file_bytes:
            return web.json_response({"error": "Missing file in multipart form body"}, status=400)

        # Discord upload limit check (standard bots have 25MB limit on Discord)
        size_mb = len(file_bytes) / (1024 * 1024)
        if size_mb > 24.5:
            return web.json_response({
                "error": f"File is {size_mb:.1f}MB, which exceeds Discord's standard 25MB bot upload limit."
            }, status=413)

        # Prepare Discord File and Embed
        discord_file = discord.File(io.BytesIO(file_bytes), filename=file_name)
        
        embed = discord.Embed(
            title=f"📥 {file_name}",
            description=f"Received via **Chand's Cross-Device File Dropper**",
            color=0x4F46E5 # Indigo
        )
        embed.add_field(name="Sender Device", value=f"📱 `{uploader}`", inline=True)
        embed.add_field(name="Room Code", value=f"🔑 `{room_code}`", inline=True)
        embed.add_field(name="File Size", value=f"📦 `{size_mb:.2f} MB`" if size_mb >= 1 else f"📦 `{len(file_bytes)/1024:.1f} KB`", inline=True)
        embed.set_footer(text="Secured Server-to-Bot Bridge • Zero Leaks")

        # Send to Discord channel
        msg = await channel.send(embed=embed, file=discord_file)
        print(f"[Discord Bot] Successfully posted '{file_name}' to #{channel.name} (Msg ID: {msg.id})")

        return web.json_response({
            "success": True,
            "message": f"Successfully posted {file_name} to #{channel.name}",
            "message_id": str(msg.id)
        })

    except Exception as e:
        print(f"[Discord Bot Error] Failed to process incoming file: {e}")
        return web.json_response({"error": f"Bot error: {str(e)}"}, status=500)

async def handle_ping(request: web.Request):
    """Health check / test ping endpoint."""
    if not verify_auth(request):
        return web.json_response({"error": "Unauthorized: Invalid secret token"}, status=401)
    
    channel_name = None
    if bot.is_ready() and DISCORD_CHANNEL_ID != 0:
        ch = bot.get_channel(DISCORD_CHANNEL_ID)
        channel_name = ch.name if ch else "Channel ID not found"

    return web.json_response({
        "status": "ok",
        "bot_ready": bot.is_ready(),
        "bot_user": str(bot.user) if bot.user else None,
        "target_channel": channel_name,
    })

http_app.router.add_post('/api/receive-file', handle_receive_file)
http_app.router.add_get('/api/ping', handle_ping)
http_app.router.add_post('/api/ping', handle_ping)

# -------------------------------------------------------------
# Bot Lifecycle
# -------------------------------------------------------------
@bot.event
async def on_ready():
    print("=" * 60)
    print(f"✅ Discord Bot is ONLINE as: {bot.user} (ID: {bot.user.id})")
    print(f"Target Channel ID: {DISCORD_CHANNEL_ID}")
    print(f"Secret Authorization: {'[SET]' if DISCORD_BOT_SECRET else '[NOT SET]'}")
    
    # Start the secure HTTP receiver server alongside Discord Bot
    runner = web.AppRunner(http_app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    print(f"🚀 Secure Receiver API running at http://0.0.0.0:{PORT}/api/receive-file")
    print("=" * 60)

if __name__ == "__main__":
    if DISCORD_BOT_TOKEN == "YOUR_BOT_TOKEN_HERE":
        print("[ERROR] Please set your DISCORD_BOT_TOKEN environment variable!")
        sys.exit(1)
    bot.run(DISCORD_BOT_TOKEN)
