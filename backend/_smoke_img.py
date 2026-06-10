import urllib.request, urllib.parse, json

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def wiki(query, n=3):
    q = urllib.parse.quote(query)
    url = (
        "https://en.wikipedia.org/w/api.php?"
        "action=query&format=json&prop=pageimages&piprop=original&pithumbsize=800"
        f"&generator=search&gsrsearch={q}&gsrlimit={n}&origin=*"
    )
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read().decode("utf-8"))
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for page in pages.values():
        orig = (page.get("original") or {}).get("source")
        thumb = (page.get("thumbnail") or {}).get("source")
        img = orig or thumb
        if img:
            out.append({"title": page.get("title"), "url": img})
    return out


def unsplash(query):
    q = urllib.parse.quote(query)
    url = f"https://source.unsplash.com/featured/?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.geturl()
    except Exception as e:
        return f"err: {e}"


for term in ["coca cola", "jollof rice", "pepperoni pizza", "fried chicken"]:
    print(f"=== {term} ===")
    w = wiki(term, 2)
    print("wiki:", len(w))
    for x in w:
        print(" ", x["title"], "-->", x["url"])
    print("unsplash:", unsplash(term))
    print()
