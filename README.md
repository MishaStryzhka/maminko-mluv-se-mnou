# Maminko, mluv se mnou

## Administrace

Administrace používá účty uložené v Neon databázi a přihlášení e-mailem a heslem. Hesla se ukládají pouze jako scrypt hash se samostatným saltem a přihlášený uživatel dostane HttpOnly/Secure session cookie.

### První administrátor

První účet je omezen na e-mail `mykhailo.stryzhka@seznam.cz` (lze změnit přes `ADMIN_OWNER_EMAIL`). Pro jednorázové vytvoření prvního účtu se použije hodnota `ADMIN_API_TOKEN` jako setup kód. Jakmile je první účet vytvořen, setup endpoint další účet nevytvoří a `ADMIN_API_TOKEN` lze z Vercelu odstranit.

### Role

- `admin` – plný přístup a správa uživatelů
- `sales` – objednávky a budoucí správa zásilek
- `accountant` – přehled objednávek a plateb bez správy uživatelů a zásilek

Administrátor přidává další uživatele přes jednorázovou pozvánku platnou 48 hodin. Pozvaný uživatel si na pozvánkové stránce nastaví vlastní heslo.
