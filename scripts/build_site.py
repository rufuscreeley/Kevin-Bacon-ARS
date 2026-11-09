#!/usr/bin/env python3
"""Prepare the static GitHub Pages site and its compact graph data."""

from __future__ import annotations

import argparse
import array
import csv
import gzip
import io
import json
import shutil
import struct
import sys
import tempfile
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, TextIO


ROOT = Path(__file__).resolve().parents[1]
DATASET_URLS = {
    "movies.csv": "1ACd7kKcMPBSIDwdDcT5pTY7k2HmbALjG",
    "people.csv": "1FVlEcggtRw1IOKB_mLiLIIf-h2bSBwsH",
    "stars.csv": "10mp7ybqTJyIt6XPrGUG_L1ABamcwQJ_z",
}
GRAPH_MAGIC = b"KBPG"
GRAPH_VERSION = 1


@contextmanager
def csv_rows(path: Path, expected: set[str]) -> Iterator[tuple[TextIO, csv.DictReader]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not expected.issubset(reader.fieldnames):
            raise ValueError(f"{path.name} must contain columns: {', '.join(sorted(expected))}")
        yield handle, reader


def gzip_json(path: Path, value: object) -> None:
    with path.open("wb") as raw, gzip.GzipFile(
        filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0
    ) as compressed:
        with io.TextIOWrapper(compressed, encoding="utf-8") as text:
            json.dump(value, text, ensure_ascii=False, separators=(",", ":"))


def write_graph(path: Path, person_count: int, movie_count: int, edges: array.array) -> None:
    node_count = person_count + movie_count
    degrees = array.array("I", [0]) * node_count
    edge_count = len(edges) // 2
    for position in range(0, len(edges), 2):
        person = edges[position]
        movie = person_count + edges[position + 1]
        degrees[person] += 1
        degrees[movie] += 1

    offsets = array.array("I", [0]) * (node_count + 1)
    for node, degree in enumerate(degrees):
        offsets[node + 1] = offsets[node] + degree
    neighbors = array.array("I", [0]) * (edge_count * 2)
    cursor = array.array("I", offsets[:-1])
    for position in range(0, len(edges), 2):
        person = edges[position]
        movie = person_count + edges[position + 1]
        neighbors[cursor[person]] = movie
        cursor[person] += 1
        neighbors[cursor[movie]] = person
        cursor[movie] += 1

    with path.open("wb") as raw, gzip.GzipFile(
        filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0
    ) as compressed:
        compressed.write(
            struct.pack(
                "<4sIIIII",
                GRAPH_MAGIC,
                GRAPH_VERSION,
                person_count,
                movie_count,
                node_count,
                edge_count,
            )
        )
        for values in (offsets, neighbors):
            if values.itemsize != 4:
                raise RuntimeError("The graph format requires 32-bit unsigned integers.")
            if sys.byteorder != "little":
                values.byteswap()
            compressed.write(values.tobytes())
            if sys.byteorder != "little":
                values.byteswap()


def build(
    people_path: Path,
    output: Path,
    movies_path: Path | None = None,
    stars_path: Path | None = None,
) -> dict[str, int]:
    movies_path = movies_path or ROOT / "movies.csv"
    stars_path = stars_path or ROOT / "stars.csv"
    people_by_id: dict[str, int] = {}
    first_node_by_name: dict[str, int] = {}
    person_names: list[str] = []
    person_count = 0
    with csv_rows(people_path, {"id", "name"}) as (handle, reader):
        for row in reader:
            person_id = row["id"]
            if person_id in people_by_id:
                raise ValueError(f"Duplicate person id in {people_path.name}: {person_id}")
            people_by_id[person_id] = person_count
            name = row["name"]
            first_node_by_name.setdefault(name, person_count)
            person_names.append(name)
            person_count += 1

    movie_by_id: dict[str, int] = {}
    movies: list[list[object]] = []
    years: list[int] = []
    with csv_rows(movies_path, {"id", "title", "year"}) as (handle, reader):
        for row in reader:
            movie_id = row["id"]
            if movie_id in movie_by_id:
                raise ValueError(f"Duplicate movie id in {movies_path.name}: {movie_id}")
            movie_by_id[movie_id] = len(movies)
            raw_year = row["year"].strip()
            try:
                year: int | None = int(raw_year)
            except ValueError:
                year = None
            if year is not None:
                years.append(year)
            movies.append([row["title"], year])

    edges = array.array("I")
    edge_keys: set[int] = set()
    source_rows = 0
    duplicate_edges = 0
    unknown_people_rows = 0
    unknown_movies_rows = 0
    with csv_rows(stars_path, {"Source", "Target"}) as (handle, reader):
        for row in reader:
            source_rows += 1
            person = people_by_id.get(row["Source"])
            if person is None:
                unknown_people_rows += 1
                continue
            movie = movie_by_id.get(row["Target"])
            if movie is None:
                unknown_movies_rows += 1
                continue
            key = person * len(movies) + movie
            if key in edge_keys:
                duplicate_edges += 1
                continue
            edge_keys.add(key)
            edges.extend((person, movie))

    if not person_count or not movies or not edges:
        raise ValueError("The source datasets must contain people, movies, and actor-movie links.")
    if person_count + len(movies) >= 2**32 or len(edges) // 2 >= 2**32:
        raise ValueError("The graph is too large for the current 32-bit static data format.")

    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "site", output, dirs_exist_ok=True)
    data_dir = output / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    actor_path = data_dir / "actors.json.gz"
    with actor_path.open("wb") as raw, gzip.GzipFile(
        filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0
    ) as compressed:
        with io.TextIOWrapper(compressed, encoding="utf-8") as text:
            text.write("[")
            for index, name in enumerate(sorted(first_node_by_name)):
                if index:
                    text.write(",")
                json.dump(
                    [name, first_node_by_name[name]],
                    text,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            text.write("]")

    gzip_json(data_dir / "person-names.json.gz", person_names)
    gzip_json(data_dir / "movies.json.gz", movies)
    write_graph(data_dir / "graph.bin.gz", person_count, len(movies), edges)

    degrees = array.array("I", [0]) * person_count
    for position in range(0, len(edges), 2):
        degrees[edges[position]] += 1
    stats = {
        "actors": sum(degree > 0 for degree in degrees),
        "movies": len(movies),
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
        "connections": len(edges) // 2,
        "people": person_count,
        "source_connections": source_rows,
        "duplicate_connections": duplicate_edges,
        "unknown_people_rows": unknown_people_rows,
        "unknown_movies_rows": unknown_movies_rows,
    }
    (data_dir / "stats.json").write_text(
        json.dumps(stats, separators=(",", ":")), encoding="utf-8"
    )
    return stats


def download_dataset(filename: str, destination: Path) -> None:
    url = (
        "https://drive.google.com/uc?export=download&confirm=t"
        f"&id={DATASET_URLS[filename]}"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Kevin-Bacon-ARS-Pages/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)
    if destination.stat().st_size < 1_000_000:
        destination.unlink(missing_ok=True)
        raise ValueError(f"The public Drive response was too small to be {filename}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--people-csv",
        type=Path,
        help="Use a local people.csv instead of downloading it from public Google Drive.",
    )
    parser.add_argument("--movies-csv", type=Path, help="Use a local movies.csv.")
    parser.add_argument("--stars-csv", type=Path, help="Use a local stars.csv.")
    parser.add_argument(
        "--download-data",
        action="store_true",
        help="Download all three CSVs from the public Google Drive files used by Streamlit.",
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "_site", help="Static site output directory."
    )
    args = parser.parse_args()

    if args.download_data and (args.people_csv or args.movies_csv or args.stars_csv):
        parser.error("--download-data cannot be combined with individual CSV paths.")
    if args.movies_csv and not args.movies_csv.is_file():
        parser.error(f"movies.csv not found: {args.movies_csv}")
    if args.stars_csv and not args.stars_csv.is_file():
        parser.error(f"stars.csv not found: {args.stars_csv}")

    if args.download_data:
        with tempfile.TemporaryDirectory(prefix="kevin-bacon-pages-") as directory:
            data_dir = Path(directory)
            for filename in DATASET_URLS:
                print(f"Downloading public {filename} from Google Drive...", flush=True)
                download_dataset(filename, data_dir / filename)
            stats = build(
                data_dir / "people.csv",
                args.output.resolve(),
                data_dir / "movies.csv",
                data_dir / "stars.csv",
            )
    else:
        movies_path = args.movies_csv.resolve() if args.movies_csv else ROOT / "movies.csv"
        stars_path = args.stars_csv.resolve() if args.stars_csv else ROOT / "stars.csv"
        if args.people_csv:
            people_path = args.people_csv.resolve()
            if not people_path.is_file():
                parser.error(f"people.csv not found: {people_path}")
            stats = build(people_path, args.output.resolve(), movies_path, stars_path)
        else:
            with tempfile.TemporaryDirectory(prefix="kevin-bacon-pages-") as directory:
                people_path = Path(directory) / "people.csv"
                print("Downloading public people.csv from Google Drive...", flush=True)
                download_dataset("people.csv", people_path)
                stats = build(people_path, args.output.resolve(), movies_path, stars_path)

    print(
        "Prepared static site: "
        f"{stats['actors']:,} credited actors, {stats['movies']:,} movies, "
        f"{stats['connections']:,} unique connections "
        f"({stats['duplicate_connections']:,} duplicates removed, "
        f"{stats['unknown_people_rows'] + stats['unknown_movies_rows']:,} unmatched rows skipped: "
        f"{stats['unknown_people_rows']:,} unknown actors, {stats['unknown_movies_rows']:,} unknown movies)."
    )
    data_dir = args.output.resolve() / "data"
    total_bytes = sum(path.stat().st_size for path in data_dir.iterdir() if path.is_file())
    print(f"Compressed graph data: {total_bytes:,} bytes in {data_dir}")


if __name__ == "__main__":
    main()
