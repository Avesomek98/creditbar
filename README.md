# Moje Kredyty

Prosta aplikacja PWA do śledzenia kredytów i pożyczek z różnych banków w jednym miejscu.
Dane są zapisywane **wyłącznie lokalnie** w telefonie (localStorage) — nie ma żadnego
serwera ani konta. Aplikacja działa też offline.

## Funkcje

- Lista wszystkich kredytów/pożyczek z pasujących banków w jednym miejscu
- Dodawanie / edycja / usuwanie kredytu: bank, nazwa, kwota całkowita, kwota pozostała,
  rata miesięczna, oprocentowanie, liczba rat, spłacone raty, data kolejnej płatności, notatki
- Pasek postępu spłaty dla każdego kredytu + podsumowanie łączne (suma zadłużenia,
  suma rat miesięcznych, ogólny % spłaty)
- Instalacja na ekranie głównym iPhone'a (działa jak natywna appka, pełny ekran, offline)

## Struktura

```
index.html   – szkielet aplikacji
style.css    – wygląd (jasny/ciemny motyw, mobile-first)
app.js       – logika (localStorage, formularz, renderowanie)
manifest.json– manifest PWA
sw.js        – service worker (cache offline)
icons/       – ikony aplikacji (wygenerowane skryptem scripts/generate-icons.mjs)
```

## Wdrożenie na GitHub Pages (żeby zainstalować na iPhonie)

PWA na iOS wymaga, żeby strona była serwowana przez **HTTPS** (nie zadziała otwarta
lokalnie z dysku) — GitHub Pages daje to za darmo.

1. Załóż nowe, **puste** repozytorium na GitHub (bez README), np. `creditbar`.
2. W tym folderze wykonaj (podmień `TWOJ-LOGIN`):

   ```
   git remote add origin https://github.com/TWOJ-LOGIN/creditbar.git
   git branch -M main
   git push -u origin main
   ```

3. Na GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   branch: `main`, folder: `/ (root)` → **Save**.
4. Po chwili strona będzie dostępna pod `https://TWOJ-LOGIN.github.io/creditbar/`.

## Instalacja na iPhonie

1. Otwórz link z kroku 4 powyżej w **Safari** na iPhonie.
2. Stuknij ikonę **Udostępnij** (kwadrat ze strzałką w górę).
3. Wybierz **„Dodaj do ekranu głównego"**.
4. Gotowe — appka pojawi się jako ikona, otwiera się na pełnym ekranie i działa offline.

## Aktualizacje

Po każdej zmianie w kodzie zrób `git add`, `git commit`, `git push` — GitHub Pages
sam przebuduje stronę w ciągu chwili. Jeśli zmieniasz pliki cache'owane przez
service worker, podbij numer w `CACHE_NAME` w `sw.js`, żeby telefon pobrał świeżą wersję.

## Backup danych

Dane są tylko na tym urządzeniu (localStorage w Safari). Jeśli wyczyścisz dane Safari
albo zmienisz telefon, stracisz listę kredytów. Jeśli chcesz, mogę dodać przycisk
eksportu/importu kopii zapasowej (plik JSON) — daj znać.
