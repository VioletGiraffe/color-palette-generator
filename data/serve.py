# The dev server .claude/launch.json starts: the project root over HTTP, every response marked no-store. A page that
# fetches index.html fresh (page-source.js) would otherwise run it against a cached copy of a helper it loads by script tag.
#
#     python data/serve.py [port]

import functools
import http.server
import pathlib
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8734
root = pathlib.Path(__file__).resolve().parent.parent
http.server.ThreadingHTTPServer(("", port), functools.partial(NoStoreHandler, directory=str(root))).serve_forever()
