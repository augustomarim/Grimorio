"""Coerência do exemplo com o catálogo: não é validação normativa integral D&D."""
from pathlib import Path
import json
import sqlite3
import unittest

ROOT=Path(__file__).resolve().parents[1]

class FixtureCatalogTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript((ROOT/'schema.sql').read_text())
        self.db.executescript((ROOT/'sample-data.sql').read_text())

    def tearDown(self):self.db.close()

    def test_background_feat_and_tool_match_external_record(self):
        background=json.loads(self.db.execute('SELECT b.data FROM dnd_character d JOIN lib_background b ON b.id=d.background_id WHERE d.character_id=1').fetchone()[0])
        feats={x['id'] for x in background.get('featsFixed',[])}
        tools=set(background.get('toolsFixed',[]))
        rows=self.db.execute('''SELECT fe.slug,te.slug FROM character_ability a
            JOIN character_rule_grant g ON g.id=a.grant_id
            LEFT JOIN lib_feat f ON f.id=a.lib_feat_id LEFT JOIN catalog_entry fe ON fe.id=f.catalog_entry_id
            LEFT JOIN lib_tool t ON t.id=a.lib_tool_id LEFT JOIN catalog_entry te ON te.id=t.catalog_entry_id
            WHERE a.character_id=1 AND g.origin_kind='background' ''').fetchall()
        self.assertEqual(rows,[('alert',None),(None,'thieves-tools')])
        for feat,tool in rows:
            if feat:self.assertIn(feat,feats)
            if tool:self.assertIn(tool,tools)

    def test_language_matches_class_and_common_is_universal(self):
        record,slug=self.db.execute('''SELECT cl.data,e.slug FROM character_ability a
            JOIN character_rule_grant g ON g.id=a.grant_id
            JOIN character_class cc ON cc.id=g.origin_character_class_id JOIN lib_class cl ON cl.id=cc.class_id
            JOIN lib_language l ON l.id=a.lib_language_id JOIN catalog_entry e ON e.id=l.catalog_entry_id
            WHERE a.character_id=2''').fetchone()
        self.assertIn(slug,json.loads(record).get('languagesFixed',[]))
        self.assertEqual(self.db.execute("SELECT l.is_always FROM lib_language l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE e.slug='common'").fetchone(),(1,))
        self.assertEqual(self.db.execute("SELECT count(*) FROM character_ability a JOIN lib_language l ON l.id=a.lib_language_id WHERE l.is_always=1").fetchone(),(0,))

    def test_preparation_arrays_use_individual_class_levels(self):
        rows=self.db.execute('''SELECT e.slug,cc.level,cl.data FROM character_class cc
            JOIN lib_class cl ON cl.id=cc.class_id JOIN catalog_entry e ON e.id=cl.catalog_entry_id
            WHERE cc.character_id=1''').fetchall()
        actual={slug:(level,json.loads(raw)['casting']['prepared'][level-1],json.loads(raw)['casting']['maxSpellLevel'][level-1]) for slug,level,raw in rows}
        self.assertEqual(actual,{'wizard':(3,6,2),'cleric':(4,7,2),'sorcerer':(3,6,2)})
        self.assertEqual(self.db.execute('SELECT total_level FROM character_summary WHERE id=1').fetchone(),(10,))

if __name__=='__main__':unittest.main()
