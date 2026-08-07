-- OGR public showroom sales-volume rank via public_sort_order (lower = higher).
-- Ranked tees: 10, 20, 30, … so staff can insert between later.
-- Other published OGR items still at 0 get a high fallback so they sort after.

with ranked (sku, sort_order) as (
  values
    ('OG2042', 10),
    ('OG2513', 20),
    ('OG2117', 30),
    ('OG2092', 40),
    ('OG2147', 50),
    ('OG0921', 60),
    ('OG1066', 70),
    ('OG2236', 80),
    ('OG2251', 90),
    ('OG2142', 100),
    ('OG0783', 110),
    ('OG2164', 120),
    ('OG1161', 130),
    ('OG2146-GM', 140),
    ('OG2326', 150),
    ('OG2086-GM', 160),
    ('OG2520-GM', 170),
    ('OG0984', 180),
    ('OG2511', 190),
    ('OG2025', 200),
    ('OG2127', 210),
    ('OG1125', 220),
    ('OG2144-GM', 230),
    ('OG2253', 240),
    ('OG2023', 250),
    ('OG2051-V', 260),
    ('OG2162', 270),
    ('OG2157', 280),
    ('OG2059', 290),
    ('OG1032', 300),
    ('OG2163', 310),
    ('OG2225', 320),
    ('OG2054', 330),
    ('OG2211-GM', 340),
    ('OG2333-GM', 350),
    ('OG1154', 360),
    ('OG2435-GM', 370),
    ('OG2242', 380),
    ('OG2062', 390),
    ('OG2230', 400),
    ('OG0033', 410),
    ('OG2247', 420),
    ('OG2094', 430)
)
update catalog_items ci
set public_sort_order = ranked.sort_order
from ranked
join lines l on l.code = 'ogr'
where ci.line_id = l.id
  and ci.sku = ranked.sku;

-- Published OGR items still at default 0 sort after the ranked list
update catalog_items ci
set public_sort_order = 9000 + coalesce(ci.page, 0) * 10
from lines l
where l.id = ci.line_id
  and l.code = 'ogr'
  and ci.is_publicly_published = true
  and ci.public_sort_order = 0;
