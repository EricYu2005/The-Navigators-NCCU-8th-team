"""
scripts/generate_png_icons.py
Render public/icons/icon.svg to high-quality PNGs (192x192, 512x512, and logo.png) using headless Chrome/Edge.
"""

import os
import subprocess
import sys

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(root_dir, 'public', 'icons')
    svg_file = os.path.join(icons_dir, 'icon.svg')

    if not os.path.exists(svg_file):
        print(f"Error: {svg_file} does not exist")
        sys.exit(1)

    browsers = [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
    ]
    browser = None
    for b in browsers:
        if os.path.exists(b):
            browser = b
            break

    if not browser:
        print("Error: Chrome or Edge not found")
        sys.exit(1)

    print(f"Using browser: {browser}")

    # Generate images for different target sizes:
    # 512x512 (icon-512.png)
    # 192x192 (icon-192.png)
    # 1024x1024 / 512x512 (logo.png)
    targets = [
        (512, os.path.join(icons_dir, 'icon-512.png')),
        (192, os.path.join(icons_dir, 'icon-192.png')),
        (512, os.path.join(icons_dir, 'logo.png')),
        (1024, os.path.join(icons_dir, 'logo-1024.png')),
        (512, os.path.join(root_dir, 'public', 'logo.png'))
    ]

    for size, out_png in targets:
        html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    width: {size}px;
    height: {size}px;
    overflow: hidden;
    background: transparent;
  }}
  img {{
    width: {size}px;
    height: {size}px;
    display: block;
  }}
</style>
</head>
<body>
  <img src="{svg_file.replace(os.sep, '/')}" />
</body>
</html>"""
        temp_html = os.path.join(icons_dir, f'_render_{size}.html')
        with open(temp_html, 'w', encoding='utf-8') as f:
            f.write(html_content)

        file_url = 'file:///' + temp_html.replace(os.sep, '/')
        cmd = [
            browser,
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            '--default-background-color=00000000',
            f'--window-size={size},{size}',
            f'--screenshot={out_png}',
            file_url
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if os.path.exists(temp_html):
            os.remove(temp_html)

        if os.path.exists(out_png) and os.path.getsize(out_png) > 0:
            print(f"Generated {os.path.basename(out_png)} ({size}x{size}): {os.path.getsize(out_png)} bytes")
        else:
            print(f"Failed to generate {out_png}")

if __name__ == '__main__':
    main()
