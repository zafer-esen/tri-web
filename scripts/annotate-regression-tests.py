#!/usr/bin/env python3
"""
Add TRICERA-OPTIONS comments to regression test files.

For each .c/.hcc file under examples/regression-tests/, prepend a comment line
that tells the web interface which TriCera options are recommended for that
file. The options come from:
  1. A per-directory default (from runalldirs), stripped of dev-only flags.
  2. A sibling <name>.yml file that may specify a subproperty (e.g. valid-free).

Run once after copying regression tests into examples/regression-tests/.
Safe to re-run: replaces any existing TRICERA-OPTIONS line.
"""

import os
import re
import sys

REGRESSION_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              '..', 'examples', 'regression-tests')

# Per-directory default options for the web interface.
# Filtered from runalldirs: we exclude -assert, -assertNoVerify, -dev, -t:60
# (the web interface enforces its own timeout and there are no dev-only flags).
DIR_DEFAULTS = {
    'horn-hcc-heap':              ['-cex', '-heapModel:native'],
    'horn-hcc-array':             ['-cex'],
    'horn-bv':                    ['-cex', '-arithMode:ilp32'],
    'horn-hcc':                   ['-cex'],
    'horn-hcc-2':                 ['-cex'],
    'horn-hcc-pointer':           ['-cex'],
    'horn-hcc-struct':            ['-cex'],
    'horn-hcc-enum':              ['-cex'],
    'horn-contracts':             ['-cex'],
    'acsl-contracts':             [],
    'acsl-standalone':            ['-m:foo', '-cex'],
    'uninterpreted-predicates':   ['-cex'],
    'math-arrays':                ['-cex', '-mathArrays', '-sol'],
    'quantifiers':                ['-cex'],
    'interpreted-predicates':     ['-cex'],
    'properties':                 [],
    'toh-contract-translation':   [],
    'loop-invariants':            ['-m:foo', '-inv', '-acsl', '-cex'],
    'at-expressions':             ['-cex'],
    'inv-encoding-reachsafety':   [],
    'horn-contract-parsing':      ['-cex'],
}

SUBPROPERTY_FLAGS = {
    'valid-deref':      '-valid-deref',
    'valid-free':       '-valid-free',
    'valid-memtrack':   '-valid-memtrack',
    'valid-memcleanup': '-valid-memcleanup',
}

# Property file name (without path/extension) -> flags.
# Referenced from .yml files via `property_file: ../properties/X.prp`.
PROPERTY_FILE_FLAGS = {
    'valid-memsafety':   ['-memsafety'],
    'valid-memcleanup':  ['-valid-memcleanup'],
    'valid-deref':       ['-valid-deref'],
    'valid-free':        ['-valid-free'],
    'valid-memtrack':    ['-valid-memtrack'],
    'unreach-call':      [],
}

def parse_yml_flags(yml_path):
    """Extract TriCera flags from a .yml task definition file.

    Handles `subproperty:` (specific memsafety sub-options) and `property_file:`
    references. The `data_model` field is SV-COMP metadata and is NOT mapped to
    TriCera flags; only per-directory defaults (from runalldirs) determine the
    arithmetic mode.
    """
    flags = []
    try:
        with open(yml_path) as f:
            content = f.read()
    except Exception:
        return flags

    # Track which property blocks have an explicit subproperty so we don't
    # also expand their property_file into -memsafety (etc.).
    # Simple parse: split into blocks by "-" at the start of a property entry.
    property_blocks = re.split(r'^\s*-\s*', content, flags=re.MULTILINE)
    for block in property_blocks:
        if 'property_file:' not in block:
            continue
        sub_match = re.search(r'subproperty:\s*(\S+)', block)
        if sub_match:
            sub = sub_match.group(1).strip()
            if sub in SUBPROPERTY_FLAGS and SUBPROPERTY_FLAGS[sub] not in flags:
                flags.append(SUBPROPERTY_FLAGS[sub])
        else:
            pf_match = re.search(r'property_file:\s*\S*?/([\w-]+)\.prp', block)
            if pf_match:
                name = pf_match.group(1)
                for f in PROPERTY_FILE_FLAGS.get(name, []):
                    if f not in flags:
                        flags.append(f)

    return flags


def annotate_file(path, flags):
    """Prepend or replace the TRICERA-OPTIONS comment in the file."""
    with open(path) as f:
        lines = f.readlines()

    comment = '// TRICERA-OPTIONS: ' + ' '.join(flags) + '\n'

    replaced = False
    for i in range(min(5, len(lines))):
        if 'TRICERA-OPTIONS:' in lines[i]:
            lines[i] = comment
            replaced = True
            break

    if not replaced:
        lines.insert(0, comment)

    with open(path, 'w') as f:
        f.writelines(lines)


def main():
    if not os.path.isdir(REGRESSION_DIR):
        print(f'Error: {REGRESSION_DIR} not found')
        sys.exit(1)

    total = 0
    for dir_name in sorted(os.listdir(REGRESSION_DIR)):
        dir_path = os.path.join(REGRESSION_DIR, dir_name)
        if not os.path.isdir(dir_path):
            continue

        defaults = DIR_DEFAULTS.get(dir_name, [])

        for file_name in sorted(os.listdir(dir_path)):
            if not (file_name.endswith('.c') or file_name.endswith('.hcc')):
                continue

            full_path = os.path.join(dir_path, file_name)
            base = os.path.splitext(file_name)[0]
            yml_path = os.path.join(dir_path, base + '.yml')

            flags = list(defaults)
            if os.path.isfile(yml_path):
                for f in parse_yml_flags(yml_path):
                    if f not in flags:
                        flags.append(f)

            annotate_file(full_path, flags)
            total += 1

        print(f'  {dir_name}: annotated {len([f for f in os.listdir(dir_path) if f.endswith((".c", ".hcc"))])} files')

    print(f'\nDone. Annotated {total} files.')


if __name__ == '__main__':
    main()
