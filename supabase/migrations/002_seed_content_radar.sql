insert into public.content_keywords (keyword, language, category, weight, enabled)
select keyword, language, category, weight, enabled
from (
  values
    ('мама', 'ru', 'мамы', 4, true),
    ('мамаша', 'ru', 'мамы', 5, true),
    ('мать', 'ru', 'мамы', 4, true),
    ('мамочка', 'ru', 'мамы', 4, true),
    ('ребёнок', 'ru', 'дети', 5, true),
    ('ребенок', 'ru', 'дети', 5, true),
    ('дети', 'ru', 'дети', 5, true),
    ('школьник', 'ru', 'школа', 4, true),
    ('школьница', 'ru', 'школа', 4, true),
    ('садик', 'ru', 'детский сад', 4, true),
    ('детский сад', 'ru', 'детский сад', 5, true),
    ('школа', 'ru', 'школа', 4, true),
    ('родители', 'ru', 'родители', 5, true),
    ('отец', 'ru', 'родители', 4, true),
    ('подростки', 'ru', 'подростки', 5, true),
    ('подросток', 'ru', 'подростки', 5, true),
    ('школота', 'ru', 'школа', 4, true),
    ('детишки', 'ru', 'дети', 4, true),
    ('яжмать', 'ru', 'мамы', 6, true),
    ('сорванец', 'ru', 'дети', 4, true),
    ('поликлиника', 'ru', 'здоровье', 4, true),
    ('утренник', 'ru', 'детский сад', 4, true),
    ('лялька', 'ru', 'дети', 4, true),
    ('грудничок', 'ru', 'дети', 5, true),
    ('батя', 'ru', 'родители', 4, true),
    ('беременная', 'ru', 'беременность', 5, true),
    ('первоклашка', 'ru', 'школа', 5, true),
    ('старшеклассник', 'ru', 'школа', 4, true),
    ('выпускник', 'ru', 'школа', 4, true)
) as seed(keyword, language, category, weight, enabled)
where not exists (
  select 1
  from public.content_keywords existing
  where existing.keyword = seed.keyword
    and existing.language = seed.language
    and existing.category = seed.category
);

insert into public.content_sources (type, name, url, query, language, enabled)
select type, name, url, query, language, enabled
from (
  values
    ('google_news', 'Google News: мама ребёнок новости', null, 'мама ребёнок новости', 'ru', true),
    ('google_news', 'Google News: дети родители скандал', null, 'дети родители скандал', 'ru', true),
    ('google_news', 'Google News: детский сад родители', null, 'детский сад родители', 'ru', true),
    ('google_news', 'Google News: школа родители конфликт', null, 'школа родители конфликт', 'ru', true),
    ('google_news', 'Google News: ребёнок видео вирусное', null, 'ребёнок видео вирусное', 'ru', true)
) as seed(type, name, url, query, language, enabled)
where not exists (
  select 1
  from public.content_sources existing
  where existing.type = seed.type
    and existing.query = seed.query
);
