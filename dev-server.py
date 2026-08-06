#!/usr/bin/env python3
"""
שרת פיתוח מקומי — כמו python -m http.server, אבל שולח
Cache-Control: no-store על כל תגובה. בלי זה הדפדפן שומר במטמון
קבצי JS ישנים ולא מרענן אותם גם אחרי שינוי בקוד ורענון מלא.
לשימוש בבדיקות מקומיות בלבד — ב-Netlify netlify.toml כבר מטפל בזה.

הרצה: python3 dev-server.py [port]
"""
import http.server
import os
import sys
from functools import partial

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
deploy_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deploy')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    http.server.test(
        HandlerClass=partial(NoCacheHandler, directory=deploy_dir),
        port=port,
        bind='0.0.0.0',
    )
