import pywikibot
from pywikibot import config
config.usernames['wikidata']['wikidata'] = 'Legoktm'
with open('generators.js') as f:
    text = f.read()

site = pywikibot.Site('wikidata', 'wikidata')
pg = pywikibot.Page(site, 'User:Legoktm/ADB.js')
pg.put(text, 'upd')

