for name in ["script.js", "walker2d.js"]:
    with open(name, "r", encoding="utf-8") as f:
        text = f.read()
    count = text.count(".png")
    text = text.replace(".png", ".webp")
    with open(name, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    print(name, "->", count, "replacements")
