-- Populate catalog_items primary/source image URLs from OGR live Shopify CDN index.
-- Source: docs/catalog/OGR_2026_Catalog_Live_Image_URLs/Catalog Products.html
-- Only fills blank image URL fields; does not invent CDN filenames for unmatched SKUs.

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg?v=1759876255'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/GAV1_2000x.jpg?v=1759876255')
where upper(trim(sku)) = upper(trim('OG2513'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-4th_2000x.jpg?v=1720044457'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-4th_2000x.jpg?v=1720044457')
where upper(trim(sku)) = upper(trim('OG2162'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-miusajpg_2000x.jpg?v=1688422947'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-miusajpg_2000x.jpg?v=1688422947')
where upper(trim(sku)) = upper(trim('OG2147'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogrcar1_2000x.jpg?v=1763955066'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogrcar1_2000x.jpg?v=1763955066')
where upper(trim(sku)) = upper(trim('OG2520-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/YaAOd7uo_2000x.jpg?v=1680648660'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/YaAOd7uo_2000x.jpg?v=1680648660')
where upper(trim(sku)) = upper(trim('OG0033'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0161_Layer_2_2000x.jpg?v=1523563180'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0161_Layer_2_2000x.jpg?v=1523563180')
where upper(trim(sku)) = upper(trim('OG1032'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2025-MainImage_2000x.jpg?v=1547888508'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2025-MainImage_2000x.jpg?v=1547888508')
where upper(trim(sku)) = upper(trim('OG2025'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/vet1-ogr_2000x.jpg?v=1771619096'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/vet1-ogr_2000x.jpg?v=1771619096')
where upper(trim(sku)) = upper(trim('OG2051'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2117-main-image_47419870-f8c6-4b94-99b2-4f0f61d52b9f_2000x.jpg?v=1641249589'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2117-main-image_47419870-f8c6-4b94-99b2-4f0f61d52b9f_2000x.jpg?v=1641249589')
where upper(trim(sku)) = upper(trim('OG2117'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/AmericanBBQbackwhitebackground_2000x.jpg?v=1672873250'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/AmericanBBQbackwhitebackground_2000x.jpg?v=1672873250')
where upper(trim(sku)) = upper(trim('OG2230'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2090-main-image_2000x.jpg?v=1588128033'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2090-main-image_2000x.jpg?v=1588128033')
where upper(trim(sku)) = upper(trim('OG2090'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2114-main-view_2000x.jpg?v=1610560061'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2114-main-view_2000x.jpg?v=1610560061')
where upper(trim(sku)) = upper(trim('OG2114'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-odgr2_2000x.jpg?v=1713468577'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-odgr2_2000x.jpg?v=1713468577')
where upper(trim(sku)) = upper(trim('OG2326'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/LeashBackWhitebackground_2000x.jpg?v=1672873957'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/LeashBackWhitebackground_2000x.jpg?v=1672873957')
where upper(trim(sku)) = upper(trim('OG2062'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/DogDayFrontWhiteBackground_2000x.jpg?v=1695153946'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/DogDayFrontWhiteBackground_2000x.jpg?v=1695153946')
where upper(trim(sku)) = upper(trim('OG2247'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2163-Main_2000x.jpg?v=1641257825'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2163-Main_2000x.jpg?v=1641257825')
where upper(trim(sku)) = upper(trim('OG2163'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2013-MainImage_2000x.jpg?v=1537273459'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2013-MainImage_2000x.jpg?v=1537273459')
where upper(trim(sku)) = upper(trim('OG2013'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/cowboys_2000x.jpg?v=1703104049'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/cowboys_2000x.jpg?v=1703104049')
where upper(trim(sku)) = upper(trim('OG2315'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-1b_2000x.jpg?v=1767826088'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-1b_2000x.jpg?v=1767826088')
where upper(trim(sku)) = upper(trim('OG2529'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2226RETIREMENTPLAN_BK_2000x.jpg?v=1675208741'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2226RETIREMENTPLAN_BK_2000x.jpg?v=1675208741')
where upper(trim(sku)) = upper(trim('OG2226'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-nature2_2000x.jpg?v=1750272172'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-nature2_2000x.jpg?v=1750272172')
where upper(trim(sku)) = upper(trim('OG2431'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2093-main-graphic_2000x.jpg?v=1610496134'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2093-main-graphic_2000x.jpg?v=1610496134')
where upper(trim(sku)) = upper(trim('OG2093'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2089-Main-View_2000x.jpg?v=1580781689'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2089-Main-View_2000x.jpg?v=1580781689')
where upper(trim(sku)) = upper(trim('OG2089'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-roadtrip6_2000x.jpg?v=1709670626'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-roadtrip6_2000x.jpg?v=1709670626')
where upper(trim(sku)) = upper(trim('OG2335-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2112-Main_2000x.jpg?v=1641257912'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2112-Main_2000x.jpg?v=1641257912')
where upper(trim(sku)) = upper(trim('OG2112'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/VtBCROZk_2000x.jpg?v=1685478380'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/VtBCROZk_2000x.jpg?v=1685478380')
where upper(trim(sku)) = upper(trim('OG2229'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-roadhouse2_2000x.jpg?v=1711134975'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-roadhouse2_2000x.jpg?v=1711134975')
where upper(trim(sku)) = upper(trim('OG2333-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Iron-and-Octane_2000x.jpg?v=1672872938'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Iron-and-Octane_2000x.jpg?v=1672872938')
where upper(trim(sku)) = upper(trim('OG2242'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-built7_2000x.jpg?v=1740514666'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-built7_2000x.jpg?v=1740514666')
where upper(trim(sku)) = upper(trim('OG2435-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2042-main-image_2000x.jpg?v=1747426468'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2042-main-image_2000x.jpg?v=1747426468')
where upper(trim(sku)) = upper(trim('OG2042'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2086-MainImage_2000x.jpg?v=1580781485'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2086-MainImage_2000x.jpg?v=1580781485')
where upper(trim(sku)) = upper(trim('OG2086-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0110_Layer_53_2000x.jpg?v=1523473366'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0110_Layer_53_2000x.jpg?v=1523473366')
where upper(trim(sku)) = upper(trim('OG0921'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2146-Main_2000x.jpg?v=1641257799'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2146-Main_2000x.jpg?v=1641257799')
where upper(trim(sku)) = upper(trim('OG2146-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/0G2145-Main_2000x.jpg?v=1641248387'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/0G2145-Main_2000x.jpg?v=1641248387')
where upper(trim(sku)) = upper(trim('OG2145-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OTRF1_2000x.jpg?v=1740517399'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OTRF1_2000x.jpg?v=1740517399')
where upper(trim(sku)) = upper(trim('OG2310-1'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2171-Main_2000x.jpg?v=1641257966'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2171-Main_2000x.jpg?v=1641257966')
where upper(trim(sku)) = upper(trim('OG2171'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0063_Layer_101_2000x.jpg?v=1523644323'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0063_Layer_101_2000x.jpg?v=1523644323')
where upper(trim(sku)) = upper(trim('OG0336'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2160-Main_2000x.jpg?v=1641257955'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2160-Main_2000x.jpg?v=1641257955')
where upper(trim(sku)) = upper(trim('OG2160'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2059-main-image_2000x.jpg?v=1568384662'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2059-main-image_2000x.jpg?v=1568384662')
where upper(trim(sku)) = upper(trim('OG2059'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2239BORNTORIDE_BK_2000x.jpg?v=1679509404'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2239BORNTORIDE_BK_2000x.jpg?v=1679509404')
where upper(trim(sku)) = upper(trim('OG2239'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2115-main-view_2000x.jpg?v=1610560043'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2115-main-view_2000x.jpg?v=1610560043')
where upper(trim(sku)) = upper(trim('OG2115'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2170-Main_2000x.jpg?v=1641249378'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2170-Main_2000x.jpg?v=1641249378')
where upper(trim(sku)) = upper(trim('OG2170-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/American-Legend-Tee_2000x.jpg?v=1670369560'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/American-Legend-Tee_2000x.jpg?v=1670369560')
where upper(trim(sku)) = upper(trim('OG2254-S'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Shelby-GT350_2000x.jpg?v=1670368681'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Shelby-GT350_2000x.jpg?v=1670368681')
where upper(trim(sku)) = upper(trim('OG2255-S'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-surf4_a648d9bc-6428-4693-af43-50e98a867fbe_2000x.jpg?v=1774309024'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-surf4_a648d9bc-6428-4693-af43-50e98a867fbe_2000x.jpg?v=1774309024')
where upper(trim(sku)) = upper(trim('OG2407'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2048-MainImage_2000x.jpg?v=1580781425'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2048-MainImage_2000x.jpg?v=1580781425')
where upper(trim(sku)) = upper(trim('OG2048'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0007_Layer_157_2000x.jpg?v=1523983711'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0007_Layer_157_2000x.jpg?v=1523983711')
where upper(trim(sku)) = upper(trim('OG0819'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2157-Main_2000x.jpg?v=1641257900'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2157-Main_2000x.jpg?v=1641257900')
where upper(trim(sku)) = upper(trim('OG2157'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/old-woody_2000x.jpg?v=1708034630'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/old-woody_2000x.jpg?v=1708034630')
where upper(trim(sku)) = upper(trim('OG2312'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2113-main-view_2000x.jpg?v=1610560024'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2113-main-view_2000x.jpg?v=1610560024')
where upper(trim(sku)) = upper(trim('OG2113'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2017-MainImage_2000x.jpg?v=1537243418'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2017-MainImage_2000x.jpg?v=1537243418')
where upper(trim(sku)) = upper(trim('OG2017'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-Islandstyle2_2000x.jpg?v=1744928194'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-Islandstyle2_2000x.jpg?v=1744928194')
where upper(trim(sku)) = upper(trim('OG2425'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0066_Layer_98_2000x.jpg?v=1523644362'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0066_Layer_98_2000x.jpg?v=1523644362')
where upper(trim(sku)) = upper(trim('OG0984'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2164-Main_2000x.jpg?v=1641257845'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2164-Main_2000x.jpg?v=1641257845')
where upper(trim(sku)) = upper(trim('OG2164'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2092-main-image_2000x.jpg?v=1610496319'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/og2092-main-image_2000x.jpg?v=1610496319')
where upper(trim(sku)) = upper(trim('OG2092'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2172-Main_2000x.jpg?v=1669670763'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2172-Main_2000x.jpg?v=1669670763')
where upper(trim(sku)) = upper(trim('OG2172'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-maitimebrown_2000x.jpg?v=1741384414'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-maitimebrown_2000x.jpg?v=1741384414')
where upper(trim(sku)) = upper(trim('OG2410'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-Islandstate3_2000x.jpg?v=1746040049'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-Islandstate3_2000x.jpg?v=1746040049')
where upper(trim(sku)) = upper(trim('OG2412'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-st4_2000x.jpg?v=1734463841'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-st4_2000x.jpg?v=1734463841')
where upper(trim(sku)) = upper(trim('OG2409'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-hadme1_2000x.jpg?v=1742422199'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-hadme1_2000x.jpg?v=1742422199')
where upper(trim(sku)) = upper(trim('OG2415'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/lil_2000x.jpg?v=1757097478'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/lil_2000x.jpg?v=1757097478')
where upper(trim(sku)) = upper(trim('OG2426'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2232OLDPIRATESRULE_BK_2000x.jpg?v=1677783973'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2232OLDPIRATESRULE_BK_2000x.jpg?v=1677783973')
where upper(trim(sku)) = upper(trim('OG2232'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Crows-ogr1_2000x.jpg?v=1737587792'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Crows-ogr1_2000x.jpg?v=1737587792')
where upper(trim(sku)) = upper(trim('OG2430'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/crabbys6_2000x.jpg?v=1702934607'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/crabbys6_2000x.jpg?v=1702934607')
where upper(trim(sku)) = upper(trim('OG2324'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2021-MainImage_2000x.jpg?v=1547834490'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2021-MainImage_2000x.jpg?v=1547834490')
where upper(trim(sku)) = upper(trim('OG2021'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-w5_2000x.jpg?v=1744061609'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-w5_2000x.jpg?v=1744061609')
where upper(trim(sku)) = upper(trim('OG2429'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogrnb1-2_2000x.jpg?v=1691784292'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogrnb1-2_2000x.jpg?v=1691784292')
where upper(trim(sku)) = upper(trim('OG2043-SPF'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr-kir1_2000x.jpg?v=1689791452'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr-kir1_2000x.jpg?v=1689791452')
where upper(trim(sku)) = upper(trim('OG2091-SPF'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/wahoo-2_2000x.jpg?v=1724265168'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/wahoo-2_2000x.jpg?v=1724265168')
where upper(trim(sku)) = upper(trim('OG2318-SPF'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-pv3_2000x.jpg?v=1689790493'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-pv3_2000x.jpg?v=1689790493')
where upper(trim(sku)) = upper(trim('OG2164-SPF'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR2B-1_2000x.jpg?v=1691783724'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR2B-1_2000x.jpg?v=1691783724')
where upper(trim(sku)) = upper(trim('OG2164-SPF'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/recoveringworkbackwhitebackground_2000x.jpg?v=1672873020'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/recoveringworkbackwhitebackground_2000x.jpg?v=1672873020')
where upper(trim(sku)) = upper(trim('OG2225'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/e33AbqpU_2000x.jpg?v=1720637562'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/e33AbqpU_2000x.jpg?v=1720637562')
where upper(trim(sku)) = upper(trim('OG2094'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-Whisk_2000x.jpg?v=1705604409'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-Whisk_2000x.jpg?v=1705604409')
where upper(trim(sku)) = upper(trim('OG2309'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-parrot-4-F_2000x.jpg?v=1741897940'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-parrot-4-F_2000x.jpg?v=1741897940')
where upper(trim(sku)) = upper(trim('OG2427'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2142-Main_2000x.jpg?v=1641248555'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2142-Main_2000x.jpg?v=1641248555')
where upper(trim(sku)) = upper(trim('OG2142'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-glass-final_2000x.jpg?v=1748982616'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-glass-final_2000x.jpg?v=1748982616')
where upper(trim(sku)) = upper(trim('OG2251'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/untappedpotentialbackwhitebackground_2000x.png?v=1695153902'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/untappedpotentialbackwhitebackground_2000x.png?v=1695153902')
where upper(trim(sku)) = upper(trim('OG2246'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-19hole_2000x.jpg?v=1772496688'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-19hole_2000x.jpg?v=1772496688')
where upper(trim(sku)) = upper(trim('OG2065'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2023-MainImage_2000x.jpg?v=1547834479'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2023-MainImage_2000x.jpg?v=1547834479')
where upper(trim(sku)) = upper(trim('OG2023'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0081_Layer_82_2000x.jpg?v=1523639958'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0081_Layer_82_2000x.jpg?v=1523639958')
where upper(trim(sku)) = upper(trim('OG0438-3'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-LL1_2000x.jpg?v=1721855034'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/OGR-LL1_2000x.jpg?v=1721855034')
where upper(trim(sku)) = upper(trim('OG2127'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0069_Layer_94_2000x.jpg?v=1523641436'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0069_Layer_94_2000x.jpg?v=1523641436')
where upper(trim(sku)) = upper(trim('OG0783'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-older3jpg_2000x.jpg?v=1690838763'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-older3jpg_2000x.jpg?v=1690838763')
where upper(trim(sku)) = upper(trim('OG2236'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-yest4_2000x.jpg?v=1768502323'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-yest4_2000x.jpg?v=1768502323')
where upper(trim(sku)) = upper(trim('OG2527'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG1161-Main_2000x.jpg?v=1524677612'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG1161-Main_2000x.jpg?v=1524677612')
where upper(trim(sku)) = upper(trim('OG1161'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/aged2_2000x.jpg?v=1756164113'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/aged2_2000x.jpg?v=1756164113')
where upper(trim(sku)) = upper(trim('OG1154'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0027_Layer_137_2000x.jpg?v=1523654771'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0027_Layer_137_2000x.jpg?v=1523654771')
where upper(trim(sku)) = upper(trim('OG1066'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0088_Layer_75_2000x.jpg?v=1523571954'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0088_Layer_75_2000x.jpg?v=1523571954')
where upper(trim(sku)) = upper(trim('OG1113'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2253LIVINGLEGEND_BK_2000x.jpg?v=1675209311'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2253LIVINGLEGEND_BK_2000x.jpg?v=1675209311')
where upper(trim(sku)) = upper(trim('OG2253'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0143_Layer_20_2000x.jpg?v=1523471925'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/ogr_0143_Layer_20_2000x.jpg?v=1523471925')
where upper(trim(sku)) = upper(trim('OG1125'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2024-MainImage_2000x.jpg?v=1547888513'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2024-MainImage_2000x.jpg?v=1547888513')
where upper(trim(sku)) = upper(trim('OG2024'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OldGuysRockBackWhitebackground_2000x.jpg?v=1672872995'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OldGuysRockBackWhitebackground_2000x.jpg?v=1672872995')
where upper(trim(sku)) = upper(trim('OG2231'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2054-MainImage_2000x.jpg?v=1580781725'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2054-MainImage_2000x.jpg?v=1580781725')
where upper(trim(sku)) = upper(trim('OG2054'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Local-Legend-Front-Dig-version_2000x.jpg?v=1686082829'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Local-Legend-Front-Dig-version_2000x.jpg?v=1686082829')
where upper(trim(sku)) = upper(trim('OG0438-3-LS'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-lw1_2000x.jpg?v=1766441685'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-lw1_2000x.jpg?v=1766441685')
where upper(trim(sku)) = upper(trim('OG2521-LS'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-11_2000x.jpg?v=1698434811'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-11_2000x.jpg?v=1698434811')
where upper(trim(sku)) = upper(trim('OG1154-LS'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Local-Legend-Tank-top-back_2000x.jpg?v=1685744059'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Local-Legend-Tank-top-back_2000x.jpg?v=1685744059')
where upper(trim(sku)) = upper(trim('OG0438-T'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Local-Legend-Hoodie-digital-back_2000x.jpg?v=1686084175'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/Local-Legend-Hoodie-digital-back_2000x.jpg?v=1686084175')
where upper(trim(sku)) = upper(trim('OG0438-ZH'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2209-OPV5_2000x.jpg?v=1665425479'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2209-OPV5_2000x.jpg?v=1665425479')
where upper(trim(sku)) = upper(trim('OG2209'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Local-Legend-trucker-hat-white-background_2000x.jpg?v=1670958490'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Local-Legend-trucker-hat-white-background_2000x.jpg?v=1670958490')
where upper(trim(sku)) = upper(trim('OG2202'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2203-Aged-Perfection_2000x.jpg?v=1665530469'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2203-Aged-Perfection_2000x.jpg?v=1665530469')
where upper(trim(sku)) = upper(trim('OG2203'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2206-Size-Matters_2000x.jpg?v=1665530475'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2206-Size-Matters_2000x.jpg?v=1665530475')
where upper(trim(sku)) = upper(trim('OG2207'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2200-Getting-Olderjpg_2000x.jpg?v=1665530458'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2200-Getting-Olderjpg_2000x.jpg?v=1665530458')
where upper(trim(sku)) = upper(trim('OG2200'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2204-Hookin-Up_2000x.jpg?v=1665530498'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2204-Hookin-Up_2000x.jpg?v=1665530498')
where upper(trim(sku)) = upper(trim('OG2204'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2154-Bear-Patch_2000x.jpg?v=1665424446'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2154-Bear-Patch_2000x.jpg?v=1665424446')
where upper(trim(sku)) = upper(trim('OG2154'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2151-Marlin-Patch_2000x.jpg?v=1665530530'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2151-Marlin-Patch_2000x.jpg?v=1665530530')
where upper(trim(sku)) = upper(trim('OG2152'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/bff54f27-e8e4-4886-9ff1-60d8b1b29ac2-1_2000x.jpg?v=1670882286'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/bff54f27-e8e4-4886-9ff1-60d8b1b29ac2-1_2000x.jpg?v=1670882286')
where upper(trim(sku)) = upper(trim('OG2126'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2155-Golf-Crest_2000x.jpg?v=1665424844'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG2155-Golf-Crest_2000x.jpg?v=1665424844')
where upper(trim(sku)) = upper(trim('OG2155'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG934-front_bbaae0b9-be56-4163-a50c-27eb9d6120a9_2000x.jpg?v=1523474329'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG934-front_bbaae0b9-be56-4163-a50c-27eb9d6120a9_2000x.jpg?v=1523474329')
where upper(trim(sku)) = upper(trim('OG0934'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-hat3_2000x.jpg?v=1729633495'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-hat3_2000x.jpg?v=1729633495')
where upper(trim(sku)) = upper(trim('OG2428'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG1004-Main_2000x.jpg?v=1547786825'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG1004-Main_2000x.jpg?v=1547786825')
where upper(trim(sku)) = upper(trim('OG1004'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_156830655_product_2000x.jpg?v=1720041175'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_156830655_product_2000x.jpg?v=1720041175')
where upper(trim(sku)) = upper(trim('OG0309'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_752940699_product_5dcd636a-a0f2-4b23-b954-d9d68653d45e_2000x.jpg?v=1523473314'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_752940699_product_5dcd636a-a0f2-4b23-b954-d9d68653d45e_2000x.jpg?v=1523473314')
where upper(trim(sku)) = upper(trim('OG1098'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGLooksGood-MainImage_2000x.jpg?v=1566395853'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGLooksGood-MainImage_2000x.jpg?v=1566395853')
where upper(trim(sku)) = upper(trim('OG1165'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG975-camo-front-01_3301de1b-9ded-49c1-a9ef-6113d07f2fb9_2000x.jpg?v=1523473930'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG975-camo-front-01_3301de1b-9ded-49c1-a9ef-6113d07f2fb9_2000x.jpg?v=1523473930')
where upper(trim(sku)) = upper(trim('OG0975'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG308-city-green-front-01_a72222d9-7ce0-430f-b5ec-d06f9015cc25_2000x.jpg?v=1523474646'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG308-city-green-front-01_a72222d9-7ce0-430f-b5ec-d06f9015cc25_2000x.jpg?v=1523474646')
where upper(trim(sku)) = upper(trim('OG0308'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGChasingTail-MainImage_2000x.jpg?v=1566395874'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGChasingTail-MainImage_2000x.jpg?v=1566395874')
where upper(trim(sku)) = upper(trim('OG2038'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG805_LOCAL-LEGEND_FR_c3a869af-ca60-421a-b50f-cad816d1a643_2000x.jpg?v=1665294797'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG805_LOCAL-LEGEND_FR_c3a869af-ca60-421a-b50f-cad816d1a643_2000x.jpg?v=1665294797')
where upper(trim(sku)) = upper(trim('OG0805'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGShelby-MainImage_367fb9d8-edfb-4d67-9004-095b767d1363_2000x.jpg?v=1566395861'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGShelby-MainImage_367fb9d8-edfb-4d67-9004-095b767d1363_2000x.jpg?v=1566395861')
where upper(trim(sku)) = upper(trim('OG2036-S'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG484_REAR-VIEW_FR_STONE_2000x.jpg?v=1664922431'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG484_REAR-VIEW_FR_STONE_2000x.jpg?v=1664922431')
where upper(trim(sku)) = upper(trim('OG0484'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/hat52_2000x.jpg?v=1770238959'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/hat52_2000x.jpg?v=1770238959')
where upper(trim(sku)) = upper(trim('OG1166'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG394_V8_FR_2000x.jpg?v=1665294736'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OG394_V8_FR_2000x.jpg?v=1665294736')
where upper(trim(sku)) = upper(trim('OG0394'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-b-2_2000x.jpg?v=1698432048'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/ogr-b-2_2000x.jpg?v=1698432048')
where upper(trim(sku)) = upper(trim('OG2321'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/BB-1_2000x.jpg?v=1698431817'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/BB-1_2000x.jpg?v=1698431817')
where upper(trim(sku)) = upper(trim('OG2320'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Took-Decades-Oval-Magnet_2000x.jpg?v=1666137000'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Took-Decades-Oval-Magnet_2000x.jpg?v=1666137000')
where upper(trim(sku)) = upper(trim('OGA2133'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-On-Permanent-Vacation-Magnet_2000x.jpg?v=1665294821'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-On-Permanent-Vacation-Magnet_2000x.jpg?v=1665294821')
where upper(trim(sku)) = upper(trim('OGA2132'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/magnet_2000x.jpg?v=1760733857'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/magnet_2000x.jpg?v=1760733857')
where upper(trim(sku)) = upper(trim('OGA2134'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/best-round-oval-magnet_2000x.jpg?v=1666140001'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/best-round-oval-magnet_2000x.jpg?v=1666140001')
where upper(trim(sku)) = upper(trim('OGA2136'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Classic-Never-Ages-Oval-Magnet_2000x.jpg?v=1666141410'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Classic-Never-Ages-Oval-Magnet_2000x.jpg?v=1666141410')
where upper(trim(sku)) = upper(trim('OGA2140'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/keep-it-reel-magnet-oval_2000x.jpg?v=1666137791'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/keep-it-reel-magnet-oval_2000x.jpg?v=1666137791')
where upper(trim(sku)) = upper(trim('OGA2137'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Tiki-Oval-Magnet_2000x.jpg?v=1666140886'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Tiki-Oval-Magnet_2000x.jpg?v=1666140886')
where upper(trim(sku)) = upper(trim('OGA2139'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Perm-Vaca-Magnet_2000x.jpg?v=1665530406'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Perm-Vaca-Magnet_2000x.jpg?v=1665530406')
where upper(trim(sku)) = upper(trim('OGA2138'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Old-Dogs-Rule-Oval-Magnet_2000x.jpg?v=1666139425'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Old-Dogs-Rule-Oval-Magnet_2000x.jpg?v=1666139425')
where upper(trim(sku)) = upper(trim('OGA2135'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_752935892_product_63940074-9708-480b-b503-02e06383ef3e_2000x.jpg?v=1523472870'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_752935892_product_63940074-9708-480b-b503-02e06383ef3e_2000x.jpg?v=1523472870')
where upper(trim(sku)) = upper(trim('OG525'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_752935739_product_61e2b666-6640-421e-93fb-4dd6db63619c_2000x.jpg?v=1523474478'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/282280_752935739_product_61e2b666-6640-421e-93fb-4dd6db63619c_2000x.jpg?v=1523474478')
where upper(trim(sku)) = upper(trim('OG524'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Vintage-Brew-Mug-In-Box_2000x.jpg?v=1674754083'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Vintage-Brew-Mug-In-Box_2000x.jpg?v=1674754083')
where upper(trim(sku)) = upper(trim('OGA-M18'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/better-I-was-mug-white-background_2000x.jpg?v=1674704614'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/better-I-was-mug-white-background_2000x.jpg?v=1674704614')
where upper(trim(sku)) = upper(trim('OGA-M1066'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/local-legend-mug-white-background_2000x.jpg?v=1674705073'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/local-legend-mug-white-background_2000x.jpg?v=1674705073')
where upper(trim(sku)) = upper(trim('OGA-M438'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/refuse-to-grow-up-mug-white-background_2000x.jpg?v=1674754000'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/refuse-to-grow-up-mug-white-background_2000x.jpg?v=1674754000')
where upper(trim(sku)) = upper(trim('OGA-M957'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/glass4_2000x.jpg?v=1748982616'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/glass4_2000x.jpg?v=1748982616')
where upper(trim(sku)) = upper(trim('OGA-2322'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Local-Legend-Koozie_2000x.jpg?v=1665294825'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Local-Legend-Koozie_2000x.jpg?v=1665294825')
where upper(trim(sku)) = upper(trim('OGA-0040'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Still-Crazy-Koozie_2000x.jpg?v=1665174388'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Still-Crazy-Koozie_2000x.jpg?v=1665174388')
where upper(trim(sku)) = upper(trim('OGA-0037'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Chasing-Tail-Koozie_2000x.jpg?v=1665176184'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Chasing-Tail-Koozie_2000x.jpg?v=1665176184')
where upper(trim(sku)) = upper(trim('OGA-0039'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/It-Took-Decades-Koozie_2000x.jpg?v=1665294745'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/It-Took-Decades-Koozie_2000x.jpg?v=1665294745')
where upper(trim(sku)) = upper(trim('OGA-0042'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/V8-Koozie_2000x.jpg?v=1665294760'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/V8-Koozie_2000x.jpg?v=1665294760')
where upper(trim(sku)) = upper(trim('OGA-0041'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Waves-Koozie_2000x.jpg?v=1665175086'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Waves-Koozie_2000x.jpg?v=1665175086')
where upper(trim(sku)) = upper(trim('OGA-0038'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/kicktab-clear_2000x.png?v=1718053886'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/files/kicktab-clear_2000x.png?v=1718053886')
where upper(trim(sku)) = upper(trim('OGA-2156'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Blue-Truck-Vintage-Metal-Sign_2000x.jpg?v=1666998188'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Blue-Truck-Vintage-Metal-Sign_2000x.jpg?v=1666998188')
where upper(trim(sku)) = upper(trim('OGA014'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Respect-the-Rust-Sign_2000x.jpg?v=1665530478'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Respect-the-Rust-Sign_2000x.jpg?v=1665530478')
where upper(trim(sku)) = upper(trim('OGA005'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/keepin-it-reel-sign_2000x.jpg?v=1672278067'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/keepin-it-reel-sign_2000x.jpg?v=1672278067')
where upper(trim(sku)) = upper(trim('OGA001'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/American-as-IT-Gets-Sign_20791c3c-b9d0-4ac1-9614-738f2f827fa2_2000x.jpg?v=1667070860'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/American-as-IT-Gets-Sign_20791c3c-b9d0-4ac1-9614-738f2f827fa2_2000x.jpg?v=1667070860')
where upper(trim(sku)) = upper(trim('OGA010-GM'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Wrench-Sign_2000x.jpg?v=1667073759'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Wrench-Sign_2000x.jpg?v=1667073759')
where upper(trim(sku)) = upper(trim('OGA011'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Shelby-Metal-Sign_2000x.jpg?v=1667070436'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/Shelby-Metal-Sign_2000x.jpg?v=1667070436')
where upper(trim(sku)) = upper(trim('OGA008-S'));

update catalog_items
set primary_image_url = coalesce(nullif(trim(primary_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Best-Round-Metal-Sign_2000x.jpg?v=1666999390'),
    source_image_url = coalesce(nullif(trim(source_image_url), ''), 'https://oldguysrule.com/cdn/shop/products/OGR-Best-Round-Metal-Sign_2000x.jpg?v=1666999390')
where upper(trim(sku)) = upper(trim('OGA003'));

