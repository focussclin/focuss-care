# Banco do Focuss Care

O projeto Supabase remoto já possui o schema oficial do Focuss Care e suas
migrations aplicadas. A aplicação deve consumir esse schema existente; não
execute migrations locais antigas que usem `clinic_members` ou colunas como
`patients.name`.

Tabelas principais usadas pela aplicação:

- `clinics`
- `memberships`
- `profiles`
- `patients`
- `professionals`
- `appointments`

As migrations locais antigas foram removidas porque descreviam um schema
diferente do banco remoto. Novas alterações de banco devem ser criadas somente
depois de comparar o schema remoto e, então, aplicadas de forma incremental.
