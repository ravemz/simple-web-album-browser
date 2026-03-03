# Simple Web Album Browser

A minimal Flask photo browser with two albums (Recent and Favorite). View images, delete (single or bulk), and move photos to favorites. Photos are grouped by day.

## Requirements

- Python 3.10+

## Install and run locally

1. **Clone and enter the project**
   ```bash
   git clone https://github.com/ravemz/simple-web-album-browser.git
   cd simple-web-album-browser
   ```

2. **Create and activate a virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure album paths**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `ALBUM_RECENT_PATH` and `ALBUM_FAV_PATH` to existing directories on your machine.

5. **Run the server**
   ```bash
   flask run
   ```
   Open http://127.0.0.1:5000 in your browser.

To use a different port: `flask run --port 8000`
