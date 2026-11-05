"""Suporte de testes para o contrato operacional. Não é um CLI de produção."""
from hashlib import sha256
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]


def statements(script):
    buffer = ''
    for char in script:
        buffer += char
        if char == ';' and sqlite3.complete_statement(buffer):
            yield buffer
            buffer = ''
    if any(line.strip() and not line.lstrip().startswith('--') for line in buffer.splitlines()):
        raise ValueError('SQL incompleto: falta terminador')


def migration_files(directory):
    files = sorted(Path(directory).glob('*.sql'))
    result = []
    for path in files:
        match = re.fullmatch(r'(\d{4})_[a-z0-9_]+\.sql', path.name)
        if not match:
            raise ValueError('Nome de migração inválido: ' + path.name)
        result.append((int(match[1]), path, sha256(path.read_bytes()).hexdigest()))
    if [version for version, _, _ in result] != list(range(1, len(result) + 1)):
        raise ValueError('Sequência de migrações incompleta ou duplicada')
    return result


def check_history(db, directory):
    files = migration_files(directory)
    version = db.execute('PRAGMA user_version').fetchone()[0]
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migration'").fetchone()
    if not exists:
        if version or db.execute("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").fetchone():
            raise ValueError('Banco existente sem histórico: exige conciliação explícita')
        return 0, files
    history = db.execute('SELECT version,name,checksum_sha256 FROM schema_migration ORDER BY version').fetchall()
    if [row[0] for row in history] != list(range(1, version + 1)) or version > len(files):
        raise ValueError('Histórico e user_version divergentes ou versão desconhecida')
    for row, expected in zip(history, files):
        if row != (expected[0], expected[1].name, expected[2]):
            raise ValueError('Migração aplicada foi modificada')
    return version, files


def migrate(db, directory):
    if db.in_transaction:
        raise ValueError('O migrador exige uma conexão sem transação ativa')
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA journal_mode=WAL')
    applied = []
    # A leitura do histórico é repetida sob bloqueio para evitar dois executores.
    while True:
        db.execute('BEGIN IMMEDIATE')
        try:
            current, files = check_history(db, directory)
            pending = [(v, path, digest) for v, path, digest in files if v > current]
            if not pending:
                db.rollback()
                return applied
            version, path, digest = pending[0]
            for sql in statements(path.read_text()):
                # O arquivo não pode encerrar a transação que protege seu próprio histórico.
                head = sql.lstrip()
                while head.startswith('--') or head.startswith('/*'):
                    if head.startswith('--'):
                        head = head.partition('\n')[2].lstrip()
                    else:
                        head = head.partition('*/')[2].lstrip()
                token = re.match(r'[A-Za-z]+', head)
                if token and token[0].upper() in {'BEGIN','COMMIT','END','ROLLBACK','SAVEPOINT','RELEASE','VACUUM','ATTACH','DETACH','PRAGMA'}:
                    raise ValueError('Controle transacional ou manutenção não permitido na migração')
                db.execute(sql)
            if db.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Migração introduziu violações de FK')
            if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise ValueError('Integridade inválida após migração')
            db.execute('INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(?,?,?)', (version, path.name, digest))
            db.execute('PRAGMA user_version=' + str(version))
            db.commit()
            applied.append(version)
        except Exception:
            db.rollback()
            raise


def validate(db, directory=ROOT / 'migrations'):
    db.execute('PRAGMA foreign_keys=ON')
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('integrity_check inválido')
    if db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('foreign_key_check inválido')
    version, _ = check_history(db, directory)
    if version == 0:
        raise ValueError('Backup sem schema inicial')
    document = (ROOT / 'docs/validacao-catalogo.sql').read_text()
    query = document[document.index('WITH specialized AS'):document.index('PRAGMA foreign_key_check')]
    if db.execute(query).fetchall():
        raise ValueError('Catálogo com identidades sem detalhe')
    if db.execute("SELECT c.id FROM character c JOIN rpg_system s ON s.id=c.system_id LEFT JOIN dnd_character d ON d.character_id=c.id WHERE s.code='dnd-2024' AND d.character_id IS NULL").fetchall():
        raise ValueError('Ficha D&D sem perfil')


def backup(source_path, destination_path):
    """Copia via API SQLite e valida antes de publicar um arquivo novo."""
    source_path, destination_path = Path(source_path), Path(destination_path)
    partial = destination_path.with_name(destination_path.name + '.partial')
    if destination_path.exists() or partial.exists():
        raise FileExistsError('Destino já existe: não sobrescrever')
    source = sqlite3.connect(source_path.resolve().as_uri() + '?mode=ro', uri=True)
    target = sqlite3.connect(partial)
    try:
        source.backup(target, pages=128)
    finally:
        target.close()
        source.close()
    restored = sqlite3.connect(partial.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        validate(restored)
    finally:
        restored.close()
    partial.rename(destination_path)


def snapshot(db):
    """Compara schema, todas as linhas e sequências AUTOINCREMENT, não só contagens."""
    schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name")]
    rows = {name: sorted(db.execute('SELECT * FROM "' + name + '"').fetchall(), key=repr) for name in tables}
    return schema, rows, db.execute('PRAGMA user_version').fetchone()[0]
