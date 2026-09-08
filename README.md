# Chand's File Dropper - Standalone HTML, CSS, JS Edition

A lightweight, zero-leak cross-device file-sharing application designed for projecting slides, images, and documents directly from phones to classroom/meeting room projectors without WhatsApp Web.

**Created by Chand** • [Chand's Profile](https://chand6464.github.io/r/)

---

## 📁 File Structure

```text
standalone/
├── package.json         # Minimal dependencies (express, multer, ws)
├── server.js            # Pure Node.js server (zero build step needed)
├── README.md            # Setup and DuckDNS configuration instructions
└── public/
    ├── index.html       # Clean semantic HTML5
    ├── style.css        # Responsive dark UI + Blurry Lens mode
    └── app.js           # Vanilla JavaScript + WebSockets + Web Audio
```

---

## 🚀 1. How to Run Locally

### Prerequisites
Make sure you have [Node.js](https://nodejs.org) installed on your computer.

### Step-by-Step
1. Open terminal/PowerShell inside the `standalone` folder:
   ```bash
   cd standalone
   npm install
   ```
2. Start the server:
   ```bash
   node server.js
   ```
3. Open your browser:
   - Projector / PC screen: `http://localhost:3000`
   - Any phone on the same Wi-Fi: `http://<your-computer-local-ip>:3000` (e.g. `http://192.168.1.15:3000`)

---

## 🦆 2. How to Setup Your DuckDNS Domain

Your DuckDNS domain is:
**`http://chandsfiledropper.duckdns.org`**

DuckDNS maps your subdomain `chandsfiledropper.duckdns.org` to your Public IP (e.g. `223.181.87.77`).

To let phones connect using `chandsfiledropper.duckdns.org:3000`:

### Method A: Router Port Forwarding (Direct)
1. **Find your Computer's Local IP**:
   - Windows: Open Command Prompt, run `ipconfig`, look for IPv4 address (e.g., `192.168.1.25`).
   - Mac / Linux: Run `ifconfig` or `ip a`.
2. **Log in to your Home Wi-Fi Router**:
   - Open your browser and go to `192.168.1.1` or `192.168.0.1` (check the back of your router).
   - Go to **Port Forwarding** / **Virtual Server**.
   - Add a new rule:
     - **Service Name**: `ChandFileDropper`
     - **External Port**: `3000` (or `80` if you want visitors not to have to type `:3000`)
     - **Internal IP**: `<Your computer's local IP, e.g. 192.168.1.25>`
     - **Internal Port**: `3000`
     - **Protocol**: `TCP`
3. **Open the App from Anywhere**:
   - `http://chandsfiledropper.duckdns.org:3000`

---

### Method B: Keep Your DuckDNS IP Updated Automatically
Home broadband public IPs change periodically. DuckDNS provides an auto-update URL:

- In Windows PowerShell:
  ```powershell
  Invoke-RestMethod "https://www.duckdns.org/update?domains=chandsfiledropper&token=YOUR_DUCKDNS_TOKEN&ip="
  ```
- In Linux / Mac cron:
  ```bash
  */10 * * * * curl -s "https://www.duckdns.org/update?domains=chandsfiledropper&token=YOUR_DUCKDNS_TOKEN&ip=" >/dev/null 2>&1
  ```
*(Replace `YOUR_DUCKDNS_TOKEN` with the token visible at the top of your duckdns.org dashboard).*

---

### Method C: Zero Port Forwarding & Free HTTPS Padlock (Recommended)
If your ISP uses Carrier-Grade NAT (CGNAT) or blocks router incoming ports, router port forwarding may fail. You can use Cloudflare's free tunnel alongside DuckDNS:

Run this single command while `node server.js` is running:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
This gives you an instant HTTPS link with camera permissions working on iOS and Android with zero router configuration required!
