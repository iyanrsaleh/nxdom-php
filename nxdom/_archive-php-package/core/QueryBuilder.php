<?php

namespace Nxdom\Core;

use PDO;

final class QueryBuilder
{
    private array $wheres = [];
    private array $orderBy = [];
    private ?int $limit = null;

    private const ALLOWED_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $table
    ) {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
            throw new \InvalidArgumentException("Nama tabel tidak valid: $table");
        }
    }

    public function where(string $column, string $operator, mixed $value): self
    {
        if (!in_array($operator, self::ALLOWED_OPERATORS, true)) {
            throw new \InvalidArgumentException("Operator tidak diizinkan: $operator");
        }
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
            throw new \InvalidArgumentException("Nama kolom tidak valid: $column");
        }

        $this->wheres[] = [$column, $operator, $value];
        return $this;
    }

    /**
     * Terapkan constraints.where dari manifest langsung, format
     * [[kolom, operator, nilai], ...] — lihat manifest.schema.json.
     */
    public function applyConstraints(array $constraints): self
    {
        foreach ($constraints['where'] ?? [] as [$column, $operator, $value]) {
            $this->where($column, $operator, $value);
        }

        foreach ($constraints['orderBy'] ?? [] as $order) {
            $this->orderBy($order['column'], $order['direction']);
        }

        if (isset($constraints['limit'])) {
            $this->limit($constraints['limit']);
        }

        return $this;
    }

    public function orderBy(string $column, string $direction = 'asc'): self
    {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
            throw new \InvalidArgumentException("Nama kolom tidak valid: $column");
        }
        $direction = strtolower($direction) === 'desc' ? 'DESC' : 'ASC';
        $this->orderBy[] = "$column $direction";
        return $this;
    }

    /**
     * Ganti seluruh orderBy yang sudah ditetapkan (mis. dari constraints
     * manifest) dengan satu kolom baru. Dipakai saat client mengirim
     * orderBy sendiri lewat query string (M5) — orderBy tidak bisa
     * di-AND-kan seperti where, jadi client menggantikan, bukan menambah.
     */
    public function replaceOrderBy(string $column, string $direction = 'asc'): self
    {
        $this->orderBy = [];
        return $this->orderBy($column, $direction);
    }

    public function limit(int $limit): self
    {
        $this->limit = $limit;
        return $this;
    }

    public function get(): array
    {
        [$sql, $params] = $this->buildSelect();
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function find(mixed $id, string $key = 'id'): ?array
    {
        $row = (clone $this)->where($key, '=', $id)->limit(1)->get();
        return $row[0] ?? null;
    }

    public function insert(array $data): int|string
    {
        $columns = array_keys($data);
        $placeholders = array_map(fn ($c) => ":$c", $columns);

        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $this->table,
            implode(', ', $columns),
            implode(', ', $placeholders)
        );

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($data);
        return $this->pdo->lastInsertId();
    }

    public function update(array $data): int
    {
        $set = implode(', ', array_map(fn ($c) => "$c = :set_$c", array_keys($data)));
        [$whereSql, $whereParams] = $this->buildWhere();

        $sql = "UPDATE {$this->table} SET $set" . ($whereSql ? " WHERE $whereSql" : '');

        $params = $whereParams;
        foreach ($data as $col => $val) {
            $params["set_$col"] = $val;
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    public function delete(): int
    {
        [$whereSql, $whereParams] = $this->buildWhere();
        $sql = "DELETE FROM {$this->table}" . ($whereSql ? " WHERE $whereSql" : '');

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($whereParams);
        return $stmt->rowCount();
    }

    private function buildSelect(): array
    {
        [$whereSql, $params] = $this->buildWhere();

        $sql = "SELECT * FROM {$this->table}";
        if ($whereSql) {
            $sql .= " WHERE $whereSql";
        }
        if ($this->orderBy) {
            $sql .= ' ORDER BY ' . implode(', ', $this->orderBy);
        }
        if ($this->limit !== null) {
            $sql .= ' LIMIT ' . $this->limit;
        }

        return [$sql, $params];
    }

    private function buildWhere(): array
    {
        if (!$this->wheres) {
            return ['', []];
        }

        $clauses = [];
        $params = [];

        foreach ($this->wheres as $i => [$column, $operator, $value]) {
            $param = "w{$i}_$column";

            if ($operator === 'in') {
                $values = (array) $value;
                $placeholders = [];
                foreach ($values as $j => $v) {
                    $placeholders[] = ":{$param}_$j";
                    $params["{$param}_$j"] = $v;
                }
                $clauses[] = "$column IN (" . implode(', ', $placeholders) . ')';
                continue;
            }

            $sqlOperator = $operator === '!=' ? '<>' : $operator;
            $clauses[] = "$column $sqlOperator :$param";
            $params[$param] = is_bool($value) ? (int) $value : $value;
        }

        return [implode(' AND ', $clauses), $params];
    }
}
