# Maminko, mluv se mnou

## Administrace

Administrace používá účty uložené v Neon databázi a přihlášení e-mailem a heslem. Hesla se ukládají pouze jako scrypt hash se samostatným saltem a přihlášený uživatel dostane HttpOnly/Secure session cookie s platností 7 dní. Po pěti chybných pokusech je účet na 15 minut dočasně uzamčen.

### První administrátor

První účet je omezen na e-mail `mykhailo.stryzhka@seznam.cz` (lze změnit přes `ADMIN_OWNER_EMAIL`). Pro jednorázové vytvoření prvního účtu se použije hodnota `ADMIN_API_TOKEN` pouze jako setup kód. Jakmile je první účet vytvořen, setup endpoint další účet nevytvoří a `ADMIN_API_TOKEN` lze z Vercelu odstranit. Pro běžné přihlašování se žádný token nezadává.

### Role

- `admin` – plný přístup a správa uživatelů
- `sales` – objednávky a budoucí správa zásilek; bez správy uživatelů
- `accountant` – přehled objednávek a plateb; bez správy uživatelů a bez akcí nad zásilkami

Administrátor přidává další uživatele přes jednorázovou pozvánku platnou 48 hodin. Pozvaný uživatel si na pozvánkové stránce nastaví vlastní heslo.
