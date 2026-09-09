import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from app.services import jd_fetch  # noqa: E402

# --- Test 1: ordinary content survives, script/style/nav/header/footer don't ---
html = """
<html><head><style>.x{color:red}</style></head>
<body>
<header>Site Nav</header>
<script>var x = {tracking: "config"};</script>
<main><h1>Data Analyst</h1><p>We are looking for someone with SQL experience.</p></main>
<footer>Copyright 2026</footer>
</body></html>
"""
text = jd_fetch._extract_text(html)
assert "Data Analyst" in text
assert "SQL experience" in text
assert "Site Nav" not in text
assert "tracking" not in text
assert "Copyright" not in text
print("PASS: real content survives extraction, script/style/nav/header/footer are stripped")

# --- Test 2: real bug (hh.uz, 2026-09-09) - a <template> hydration blob and
# a <noscript> "enable JavaScript" fallback both leaked into the extracted
# text, drowning out (or entirely replacing) the actual vacancy text. ---
hh_style_html = """
<html><body>
<noscript><div class="site-exceptions-content">
<div class="bloko-text">Для работы с нашим сайтом необходимо, чтобы Вы включили JavaScript в вашем браузере.</div>
</div></noscript>
<main>
<h1>QA Engineer</h1>
<p>BELLISSIMO PIZZA INTERNATIONAL, Tashkent. 1-3 years experience.</p>
</main>
<template style="display:none" id="HH-Lux-InitialState">{"redirectConfig":{"strictMode":true,"topLevelDomain":"hh.uz","permittedDomains":["hh.ru","hr.zarplata.ru"]},"banners":{"right-column":[{"id":"755","cId":"aecbfb02-39e7-400a-bd5b-c14d06504ad4"}]}}</template>
</body></html>
"""
text = jd_fetch._extract_text(hh_style_html)
assert "QA Engineer" in text
assert "BELLISSIMO PIZZA" in text
assert "включили JavaScript" not in text, "the noscript fallback message must not leak into the JD text"
assert "redirectConfig" not in text, "the template hydration-state JSON must not leak into the JD text"
assert "strictMode" not in text
print("PASS: noscript fallback text and template hydration-state JSON are both stripped (real hh.uz bug)")

print("\nALL JD_FETCH CHECKS PASSED")
