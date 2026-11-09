import gzip
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_site


class BuildSiteTests(unittest.TestCase):
    def test_builds_compact_graph_and_preserves_unique_name_resolution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "site").mkdir()
            (root / "site" / "index.html").write_text("<h1>test</h1>", encoding="utf-8")
            (root / "movies.csv").write_text(
                "id,title,year\n10,Film A,2000\n20,Film B,2010\n",
                encoding="utf-8",
            )
            (root / "stars.csv").write_text(
                "Source,Target\n1,10\n2,10\n2,20\n3,20\n2,20\n99,10\n2,999\n",
                encoding="utf-8",
            )
            people = root / "people.csv"
            people.write_text(
                "id,name,birth\n1,Alice,1980\n2,Bob,1970\n3,Cara,1990\n4,Alice,2000\n5,Unused,2001\n",
                encoding="utf-8",
            )
            output = root / "output"
            with patch.object(build_site, "ROOT", root):
                stats = build_site.build(people, output)

            self.assertEqual(stats["actors"], 3)
            self.assertEqual(stats["movies"], 2)
            self.assertEqual(stats["connections"], 4)
            self.assertEqual(stats["source_connections"], 7)
            self.assertEqual(stats["duplicate_connections"], 1)
            self.assertEqual(stats["unknown_people_rows"], 1)
            self.assertEqual(stats["unknown_movies_rows"], 1)
            self.assertEqual((stats["year_min"], stats["year_max"]), (2000, 2010))
            self.assertEqual((output / "index.html").read_text(encoding="utf-8"), "<h1>test</h1>")

            with gzip.open(output / "data" / "actors.json.gz", "rt", encoding="utf-8") as file:
                actors = json.load(file)
            self.assertEqual(actors, [["Alice", 0], ["Bob", 1], ["Cara", 2], ["Unused", 4]])
            with gzip.open(output / "data" / "person-names.json.gz", "rt", encoding="utf-8") as file:
                self.assertEqual(json.load(file), ["Alice", "Bob", "Cara", "Alice", "Unused"])
            with gzip.open(output / "data" / "movies.json.gz", "rt", encoding="utf-8") as file:
                self.assertEqual(json.load(file), [["Film A", 2000], ["Film B", 2010]])

            with gzip.open(output / "data" / "graph.bin.gz", "rb") as file:
                data = file.read()
            magic, version, people_count, movie_count, node_count, edge_count = struct.unpack(
                "<4sIIIII", data[:24]
            )
            self.assertEqual((magic, version), (b"KBPG", 1))
            self.assertEqual((people_count, movie_count, node_count, edge_count), (5, 2, 7, 4))
            offsets_start = 24
            neighbors_start = offsets_start + (node_count + 1) * 4
            offsets = struct.unpack(f"<{node_count + 1}I", data[offsets_start:neighbors_start])
            self.assertEqual(offsets[-1], edge_count * 2)
            self.assertEqual(len(data), neighbors_start + edge_count * 8)


if __name__ == "__main__":
    unittest.main()
