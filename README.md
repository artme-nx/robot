# Robot — Artificial Media

Robot iza ekrana, izdvojen iz projekta [head-tracking-3d](https://github.com/artme-nx/head-tracking-3d):
web kamera prati položaj tvojih očiju, a scena se iscrtava off-axis projekcijom tako da se monitor
ponaša kao **prozor** — kad pomakneš glavu, perspektiva se mijenja kao u stvarnosti (efekt Johnny Lee /
Sony Spatial Reality Display). Hard-surface android poprsje gleda točno u tvoje oči.

**Glava upravlja kamerom, ruke upravljaju robotom:** ista kamera prati i do dvije ruke — robot prati vrh
tvog prsta, ljuti se kad ga diraš i rastavlja se koliko otvoriš dlan; dvjema rukama uokviriš kadar kao redatelj.

Dva načina, gumb u dnu ekrana (ili `G`): **FOLLOW ME** (zadan) — kamera miruje, a robot okreće glavu i oči
za tobom; **LOOK AROUND** — ti kružiš oko robota, a on stoji mirno. Sučelje je na engleskom (posjetitelji
dolaze s Instagrama): kratke upute koje se izmjenjuju i nestaju kad gestu prvi put napraviš, i potpis
*Artificial Media* s poveznicom na [Instagram](https://instagram.com/artificial_media_studio).

Radi i na **mobitelu** (posjetitelji dolaze s Instagrama, često kroz njegov ugrađeni preglednik): robot ispuni
kadar bez stiskanja, a bez kamere se njime upravlja dodirom — vidi [Mobitel](#mobitel).

**Živo:** https://artme-nx.github.io/robot/

| Sučelje: FOLLOW ME, prva uputa | FOLLOW ME — glava 15 cm udesno, poprsje stoji | LOOK AROUND — kamera kruži |
| --- | --- | --- |
| ![Sučelje](docs/screenshots/robot-sucelje.jpg) | ![FOLLOW ME](docs/screenshots/robot-follow-me.jpg) | ![LOOK AROUND](docs/screenshots/robot-look-around.jpg) |

| Oči otvorene | Treptaj = zatvarač (blenda zatvorena) | Prekrižene oči (prst ~9 cm od lica) |
| --- | --- | --- |
| ![Oči otvorene](docs/screenshots/robot-oci-otvorene.jpg) | ![Zatvarač](docs/screenshots/robot-zatvarac.jpg) | ![Prekrižene oči](docs/screenshots/robot-prekrizene-oci.jpg) |

| Robot | Robot prati prst |
| --- | --- |
| ![Robot](docs/screenshots/robot.jpg) | ![Robot prati prst](docs/screenshots/robot-prati-prst.jpg) |

| iPhone, bez kamere | Android, s kamerom | Android — rastavljen dodirom |
| --- | --- | --- |
| ![iPhone bez kamere](docs/screenshots/mobitel-iphone-bez-kamere.jpg) | ![Android s kamerom](docs/screenshots/mobitel-android-kamera.jpg) | ![Rastavljen dodirom](docs/screenshots/mobitel-android-rastavljen.jpg) |

| iPhone položeno | Android položeno |
| --- | --- |
| ![iPhone položeno](docs/screenshots/mobitel-iphone-polozeno.jpg) | ![Android položeno](docs/screenshots/mobitel-android-polozeno.jpg) |

| Ljutnja (prst predugo blizu) | Rastavljen robot (otvoren dlan) | Rastavljen — s boka |
| --- | --- | --- |
| ![Ljuti robot](docs/screenshots/robot-ljutnja.jpg) | ![Rastavljen robot](docs/screenshots/robot-rastavljen.jpg) | ![Rastavljen robot s boka](docs/screenshots/robot-rastavljen-bok.jpg) |

| Redateljski okvir | Izrez kadra |
| --- | --- |
| ![Redateljski okvir](docs/screenshots/redateljski-okvir.jpg) | ![Izrez kadra](docs/screenshots/redateljski-kadar.jpg) |

**Unutrašnjost** (rastavljena glava izbliza — vidi [Unutrašnjost](#unutrašnjost)):

| Sprijeda | Poluprofil | Odozgo |
| --- | --- | --- |
| ![Unutrašnjost sprijeda](docs/screenshots/unutrasnjost-sprijeda.jpg) | ![Unutrašnjost s boka](docs/screenshots/unutrasnjost-bok.jpg) | ![Unutrašnjost odozgo](docs/screenshots/unutrasnjost-odozgo.jpg) |

| Jantarne oči → cijan tekućina | Druga strana | Reaktor u prsima |
| --- | --- | --- |
| ![Jantarne oči](docs/screenshots/unutrasnjost-jantar.jpg) | ![Unutrašnjost lijevo](docs/screenshots/unutrasnjost-lijevo.jpg) | ![Reaktor](docs/screenshots/unutrasnjost-poprsje.jpg) |

| Sklopljen: tekućina kroz procjep sljepoočnice | Vrat straga: priključci na ploči lubanje |
| --- | --- |
| ![Sljepoočnica](docs/screenshots/sljepoocnica-sklopljena.jpg) | ![Priključci vrata](docs/screenshots/vrat-prikljucci.jpg) |

Stack: Vite + vanilla JS + Three.js, MediaPipe Tasks Vision (FaceLandmarker + HandLandmarker),
pmndrs `postprocessing` + N8AO, meshoptimizer za generiranu geometriju.

## Robot

- Glava od zasebnih keramičkih/karbonskih panela s **pravim procjepima** (SDF ljuske), kroz procjepe na
  sljepoočnicama vidi se mehanika; panel linije, natpisi i serijski brojevi; mehanički vrat s kralješcima,
  hidraulikom (klipnjače klize), pletenim kabelima i rebrastim crijevom.
- **Oči** su slojevi prave geometrije: duboka duplja s vijcima → kućište → objektiv s gravurom →
  iris-blenda od 11 lamela → emisivni prstenovi na različitim dubinama → užarena jezgra → staklena
  rožnica s AR prevlakom → mehanički kapci. Svjetlo iz očiju je pravo svjetlo (obasjava duplju i lice).
- Oči gledaju **točno u 3D položaj tvojih očiju** (konvergencija za blizu/daleko), uz sakade (kratki
  pogledi na tvoje lijevo/desno oko i usta), mikrosakade i tremor. Glava i vrat slijede s kašnjenjem i
  inercijom (opruga s prigušenjem i "servo" mrtvom zonom). Kad se približiš, blenda se sužava i jezgra
  posvijetli; suptilno "diše".
- **Treptaj je zatvarač fotoaparata:** iris-blenda se oštro zatvori do kraja (~80 ms), kratko ostane zatvorena
  (~40 ms, da se vidi i na snimci od 30 fps) pa se otvori (~160 ms); svjetlo iz oka se pritom gotovo ugasi.
  Ponekad dva "klika" zaredom. Kapci više ne trepću — ostaju u položaju mirovanja i stisnu se samo kad je
  robot ljut.
- **Buđenje:** dok je ekran za učitavanje gore, oči su zatvorene i tamne; kad se on odtapa, jezgra se upali uz
  dva kratka titraja, a blenda se otvori u dva koraka (kratki prvi korak, stanka, puno otvaranje s blagim
  prebačajem).
- `E` mijenja boju očiju: ledeno cijan ↔ jantarna.
- **Ruke:** ispruženi kažiprst privuče pogled — oči prestanu gledati tebe i prate vrh prsta u 3D-u (blizu lica
  konvergiraju i iris-blende se suze), a kad spustiš ruku, pogled se glatko vrati na tebe. **Prekrižene oči:**
  kad je prst bliže od ~20 cm lica, obje oči jasno idu prema nosu — namjerno jače od fizički točnog kuta
  (~30° po oku na 14 cm, do 46° na ~7 cm). Dodir lica:
  glava ustukne na opruzi, oči bljesnu, blende se zatvore pa otvore; prst blizu dulje od ~2 s i robot se naljuti
  (crvene oči, jače pulsiranje, servo trzaji, stisnuti kapci), a kad makneš ruku, smiri se.
- **Rastavljanje:** otvoren dlan rastavi glavu i poprsje kao tehnički prikaz proizvoda
  (količina izravno prati koliko je ruka otvorena — vidi [Otvorenost ruke](#otvorenost-ruke--rastavljanje)). Kabeli vrata se uredno iskopčaju na ploči lubanje (utikač izađe iz
  priključka), maska se preklopi gore kao vizir, polovice kranija izađu u stranu i otvore se unatrag kao školjka
  (unutrašnjost se vidi i iz poluprofila), uši odu u stranu, slojevi očiju se razmaknu duž optičke osi, hladnjak s
  ventilatorom se podigne s vodenog bloka, a prstenovi reaktora se rašire. Unutra je kavez s prozorima i puna
  mehanika — vidi [Unutrašnjost](#unutrašnjost). Zatvaranje ruke sve postupno vrati obrnutim redom, a zadnji
  dio ide kao magnet: dijelovi sjednu s malim odskokom, spojevi kratko zasvijetle, blende škljocnu.
- **Vlastita glava:** ispusti .glb/.gltf glave bilo gdje u prozor — model sjeda na vrat, dobiva duplje i
  iste mehaničke oči (automatsko pozicioniranje). `↑`/`↓` fino pomiče oči, `[`/`]` veličina, `R` okret.

Dok se robot priprema (geometrija u workerima, HDR, fontovi, shaderi), stoji crni ekran s natpisom
*Artificial Media*; kad se robot iscrta i render se smiri, ekran se glatko odtopi.

## Unutrašnjost

Glavni kadar za Reel je rastavljena glava izbliza, pa je unutrašnjost građena kao filmski model: slojevi,
vijci i zakovice, oznake, različiti materijali (titanij, krom, anodizirani aluminij, bakar, staklo, tiskana
ploča) i puno kretanja. Sve stoji unutar kaveza i ne prolazi kroz ljusku (provjereno automatski, vidi dolje).

- **Svi kabeli i cijevi su spojeni.** Oba kraja svake veze imaju vidljiv konektor (kromirani nos, anodizirano
  tijelo s nazubljenim prstenom i gumena manžeta; kod cijevi s tekućinom matica i rukavac) koji sjedi u
  priključku s prirubnicom na dijelu na koji se spaja. Vrat ima ploču na dnu lubanje i nosač u otvoru vrata na
  poprsju: kralježnica sjedi u ležajevima, hidraulički klipovi na ušicama sa svornjacima, crijevo grla i kabeli u
  priključcima. Kabeli se pri okretu glave savijaju i ostaju spojeni; pri rastavljanju se pleteni kabeli vrata
  iskopčaju (utikač izađe 1,5 cm iz priključka, oba ostaju vidljiva), a crijevo i cijevi hlađenja se rastegnu.
- **Tekuće hlađenje:** prozirne cijevi s jarko narančastom svjetlećom tekućinom — vidi se strujanje i mjehurići.
  Krug: spremnik s razinom (mjehurići se dižu) → pumpa s rotorom koji se vrti iza staklenog prozora → lijeva
  sljepoočnica → vodeni blok na procesoru (vijugavi kanal kroz akril) → hladnjak s rebrima i ventilatorom →
  desna sljepoočnica → spremnik. Grana iz pumpe ide kroz prolaze u dnu lubanje niz vrat do reaktora u prsima i
  natrag u spremnik. Cijevi uz sljepoočnice prolaze kroz procjep panela, pa se **sjaj tekućine vidi i kad je glava
  sklopljena**. Kad su oči jantarne, tekućina je **cijan**; kad je robot ljut, teče ~2,4× brže i jače mjehuri.
- **Mehanika:** središnji **žiroskop** — tri ugniježđena prstena (s izrezima, nazubljen, kromiran) na jarmu oko
  svjetleće jezgre u žičanom kavezu; dvije **turbine** s urezima na bokovima (disk i protuturbina vrte se u
  suprotnim smjerovima, različitim brzinama) i **podatkovni bubanj** s ručicom straga dolje; **matična ploča** s
  procesorom, čipovima i nožicama, kondenzatorima, prigušnicama, slabo svijetlećim bakrenim stazama i LED-icama
  koje nepravilno trepere; **optička vlakna** od stražnjih kućišta očiju do ploče kroz koja putuju svjetlosni
  impulsi prema procesoru; servo motori očiju i čeljusti s kabelima; **reaktor** sa segmentiranim prstenovima koji
  se vrte u suprotnim smjerovima. Govorni modul iza usta je zasebna grupa (`speechModule`) za govor koji dolazi.
- **Kretanje i strujanje rastu s rastavljanjem.** Sklopljen robot ne računa unutrašnjost (skrivena je); osvježavaju
  se samo cijevi uz sljepoočnice i vrat, koji se vide.
- **Mobitel:** lakša verzija — manje sitnih dijelova i segmenata cijevi, bez zakovica, natpisa, sitnih servo kabela
  i dodatnog svjetla žiroskopa; tekućina, žiroskop, turbine i reaktor ostaju.
- **Automatska provjera** (`src/scenes/robot/inspect.js`, preko `window.__ht.robot`): `connectionReport()` za
  svaki kraj svakog kabela, cijevi, klipa i kralježnice mjeri udaljenost kraja cijevi do utikača i vrha utikača
  do ušća priključka; `fitReport()` provjerava da je svaki vrh unutarnjih dijelova (i rotirajućih u 8 položaja)
  unutar kaveza; `clearanceReport()` da središnja linija svake cijevi ne prolazi kroz druge dijelove, cijevi,
  kavez ni panele. Rezultat (76 krajeva na računalu, 56 na mobitelu): sklopljeno, puni okret glave lijevo/desno/
  gore/dolje i rastavljeno — svi spojeni s odstupanjem 0,0000 cm, ništa izvan kaveza, nijedno preklapanje.

## Ruke — geste

Kamera vidi ruke koje su podignute ispred ekrana (otprilike u visini lica). Položaj ruke u kadru postaje
točka u 3D sceni, a **primicanje ruke ekranu gura točku dublje prema robotu** (dubina iz veličine dlana,
relativno na udaljenost tvoje glave). Bez kamere geste se mogu glumiti mišem (vidi Prečaci).

| Gesta | Kako | Robot |
| --- | --- | --- |
| **Ispruženi kažiprst** | kažiprst ispružen, ostali prsti (barem opušteno) savijeni | **oči prate vrh prsta**; bliže od ~20 cm lica se **prekriže** (jasno prema nosu) i blende se suze; `H` uključuje marker na vrhu prsta |
| **Dodir** (kažiprstom) | primakni prst robotovu licu | robot se **trgne** (glava ustukne, oči bljesnu, blende se zatvore pa otvore); prst blizu > ~2 s → **ljutnja** (crvene oči, pulsiranje, servo trzaji) |
| **Otvoren dlan** | prsti ispruženi | **rastavljanje** glave i poprsja; količina izravno prati otvorenost ruke (ostaje kad spustiš ruku) |
| **Zatvaranje ruke / šaka** | prsti se savijaju; palac je svejedno gdje | robot se **postupno sklapa**; zatvorena ruka = sklopljen, kraj s "klikom", bljeskom spojeva i škljocajem blende; šaka vraća normalni kadar |
| **Okvir od dvije ruke** | palci i kažiprsti tvore pravokutnik (dva "L"), drži ~0,7 s | **redateljski izrez kadra** |

Prepoznavanje ima histerezu (strožiji uvjet za ulazak u gestu nego za izlazak), vrijeme potvrde i cooldown,
pa geste ne trepere. Dok dvije ruke tvore okvir, pojedinačne geste se ne tumače.

### Otvorenost ruke → rastavljanje

Rastavljanje kamerom nije gesta nego kontinuirana mjera (`src/tracking/gestures.js` + `src/interaction/openControl.js`):

- **Otvorenost 0–1** računa se samo iz četiri prsta, **palac se ne broji**. Za svaki prst prosjek dviju
  neovisnih mjera iz metričkih "world" landmarka: zbroj savijanja u tri zgloba (ispružen ≈ 10–45°, šaka ≈
  200–260°) i doseg (udaljenost vrha od zapešća / udaljenost zgloba od zapešća). Ruka = prosjek prstiju, pa
  jedan krivo procijenjen prst ne odlučuje sam. Ne ovisi o okretu ruke.
- **Glatko:** One Euro filtar na otvorenosti, **mrtve zone** na oba kraja (ispod 0,15 = sklopljeno, iznad
  0,85 = potpuno rastavljeno, linearno između), pa opruga rastavljanja. Pri dnu je **magnet** (otvorenost
  ispod 0,22 uz savijen kažiprst, izlaz iznad 0,28): robot se sam dovrši sklopiti brže, pa dijelovi sjednu s
  odskokom i klikom, a blenda škljocne.
- **Preuzimanje:** ruka upravlja tek kad se jasno pokaže — otvoren dlan (≥ 0,75, ~0,15 s) ili zatvorena ruka
  (~0,25 s), mirno i cijela u kadru. Ruka koja samo prolazi ili pokazuje kažiprstom ne mijenja ništa.
- **Gubitak ruke:** kad kamera na trenutak izgubi ruku, stanje ostaje točno gdje je bilo; ako se ruka u ~1 s
  vrati u sličnom položaju, nastavlja bez skoka. Brz pokret ili ruka na rubu kadra (spuštanje) vrate cilj
  na vrijednost od prije ~0,35 s (ruka se pri spuštanju opusti) i stanje ostaje. Prelazak u kažiprst isto.
- Dodir na mobitelu i miš (`O` / `Z`) rade kao i prije (geste dlan / šaka).

### Redateljski okvir

Kad dvjema rukama napraviš pravokutnik, na ekranu se pokaže tanko **tražilo**: kutne oznake, trećine, križić u
sredini i omjer slike (zaokružen na filmski: 1:1, 4:3, 3:2, 16:9, 1.85:1, 2:1, 2.39:1), a traka u dnu pokazuje
koliko još treba držati. Nakon ~0,7 s kamera glatko **izreže kadar** na taj dio scene (zoom i reframe kroz
projekciju), uz letterbox trake prema omjeru i blagi prebačaj kao kod kamermana. Izrez je usidren na točku u
sceni, pa glava i dalje upravlja kamerom (WINDOW i ORBIT), a uokvireni dio ostaje u kadru. Novi okvir unutar
izreza izrezuje dalje; **šaka** ili **širok okvir** (preko ~3/4 ekrana) vraćaju normalni kadar.

## Pokretanje

```bash
npm install
npm run dev
```

Otvori **http://localhost:5180/** u Chromeu i dopusti pristup kameri.
Kamera radi samo na `localhost` ili preko `https` (zato je javna verzija na GitHub Pages).

```bash
npm run build     # produkcijski build u dist/
npm run preview   # lokalni pregled builda
```

## Prečaci

| Tipka | Akcija |
| --- | --- |
| `M` | ručni izbor kamere: **ORBIT** ↔ **WINDOW** (kratko se prikaže u kutu) |
| `N` | ORBIT: "ovo je centar" — trenutni položaj glave postaje neutralni |
| `T` | FOLLOW ME: panel za kameru (Head gain, Head max, Eye lock); ORBIT: pojačanja, kutovi, zoom, mrtva zona, krutost opruge (spremaju se) |
| `G` | **LOOK AROUND** ↔ **FOLLOW ME** (isto kao gumb u dnu ekrana) |
| `E` | boja očiju robota (cijan / jantar) |
| `Q` | kvaliteta: high / low |
| `F` | cijeli zaslon (preporučeno) |
| `D` | debug overlay — slika kamere s točkama očiju i kosturima ruku, prepoznata gesta, **otvorenost ruke 0–1** (zaglađena i sirova, po prstima) i stanje rastavljanja, 3D položaj prsta, x/y/z glave u cm, FPS, azimut/elevacija/zoom, ritam detekcije |
| `C` | kalibracijski panel |
| `S` | crveno-cijan anaglif (stereo) |
| `K` | miš glumi glavu (kotačić = naprijed/natrag) |
| `H` | diskretan sjajni marker na vrhu prsta (ruke) |
| `U` | sakrij cijelo sučelje (HUD, gumb, upute, potpis, obavijesti) — čista slika za snimanje |
| `Shift` + miš | miš glumi vrh ispruženog kažiprsta |
| `Shift` + kotačić | dubina prsta (prema ekranu / prema sebi) |
| `O` (drži) | otvoren dlan — prsti se postupno šire dok držiš |
| `Z` (drži) | šaka |
| `B` (drži) + miš | okvir od dvije ruke: vuci pravokutnik od točke pritiska |
| `R` | u debug prikazu (`D`): **snimka upravljanja rukom** — 10 s svaki frame (sirova i zaglađena otvorenost, prsti, rub kadra, brzina, stanje upravljanja, magnet, cilj i napredak rastavljanja) spremi se u Downloads kao `robot-ruka-<vrijeme>.json` (ponovni `R` završi ranije); inače okreće vlastitu glavu za 180° |
| `[` / `]` | smanji / povećaj vlastitu glavu |
| `↑` / `↓` | fino pomicanje očiju na vlastitoj glavi |

**Vlastita glava:** povuci i ispusti `.glb` / `.gltf` (s pripadnim `.bin` i teksturama ako ih ima)
bilo gdje u prozor.

Bez kamere (odbijena dozvola, nema uređaja) miš automatski glumi glavu, a ruke se glume mišem i tipkama
`Shift`, `O`, `Z` i `B` iz tablice iznad.

## FOLLOW ME i LOOK AROUND

Gumb u dnu ekrana (i tipka `G`) prebacuje dva načina; pri otvaranju stranice uvijek je **FOLLOW ME**.

**FOLLOW ME** = fiksna kamera + pogled 3: kamera stoji u neutralnom kadru (isti kadar koji WINDOW daje za glavu u
sredini na ~60 cm) i položaj glave ne utječe ni na kameru ni na projekciju — poprsje i ramena stoje na istom
mjestu na ekranu, robot ne mijenja veličinu kad se približiš ili udaljiš (na to reagira samo blenda), a za tobom
se okreću oči, glava i vrat.
Okret glave je namjerno pojačan da reakcija bude jasna na prvi pogled. **Mišem** (i povlačenjem prsta na
mobitelu) pokazivač na rubu ekrana daje ~41° okreta glave (mobitel ~48°), na pola puta ~25° (mobitel ~33°).
Oči stignu prve, a glava i vrat slijede s kašnjenjem i inercijom; poprsje stoji.

**S kamerom** je drukčije nego s mišem: miš je meta na ekranu, pa okret prema njemu izgleda točno, ali gledatelj
je ispred ravnog ekrana s fiksnom kamerom — lice koje gleda u kameru izgleda kao da gleda njega iz svakog
položaja, a svaki veći okret u stranu izgleda kao pogled pokraj njega. Zato s kamerom:
- **oči drže kontakt:** zjenice cijelo vrijeme gledaju u render kameru (ravno iz ekrana prema tebi) bez obzira
  na okret glave — kad se glava okrene, oči se u dupljama vrate da ostanu na tebi; sakade na tvoje oči i usta
  ostaju, ali male;
- **glava i vrat samo naznačuju smjer:** okreću se prema strani na koju si otišao za stvarni geometrijski kut
  prema tvojim očima (bez pojačanja), s mekim limitom 15° vodoravno i 8° okomito; opruge i kašnjenje su isti;
- **redoslijed:** oči odmah malo krenu prema tvom novom položaju, glava krene za njima i smiri se, a oči se
  pritom vrate točno na tebe;
- neutralni položaj kalibrira se sam ~1,4 s nakon što se lice pronađe (kao za ORBIT, i nakon svakog povratka s
  miša/dodira na kameru), pa robot gleda ravno u tebe i kad ne sjediš u sredini i iako je kamera iznad ekrana;
  `N` ga postavlja ručno. Blenda prati stvarnu udaljenost. Isto na mobitelu s kamerom.

**Panel `T` u FOLLOW ME** podešava to uživo (pamti se u pregledniku) i prikazuje trenutne vrijednosti kao tekst:
*Head gain* 0–2 (udio stvarnog kuta, zadano 1), *Head max* 0–45° (meki limit vodoravno, okomito 8/15 toga,
zadano 15°) i *Eye lock* 0–1 (0 = oči ciljaju stvarni položaj tvojih očiju, 1 = render kameru, zadano 1), uz
živi prikaz kuta glave i odstupanja pogleda od kamere. U LOOK AROUND / ORBIT `T` otvara ORBIT panel kao prije.

**LOOK AROUND** = ORBIT kamera + pogled 1: ti kružiš oko robota, a on stoji mirno (opis ORBIT-a ispod).

`M` i dalje ručno bira kameru: ORBIT ili WINDOW (fizički točna off-axis projekcija s tvog oka, u kojoj se
cijeli prizor pomiče s glavom kao kroz prozor). WINDOW nije ni jedan od dva gumba, pa tada nijedan nije
označen; `G` ili gumb vraćaju u FOLLOW ME / LOOK AROUND.

### ORBIT

Perspektivna kamera uvijek gleda u točku interesa (središte glave robota), robot stoji mirno, a ti kružiš
oko njega.

- **Neutralni položaj** se automatski kalibrira u prve ~1,5 s nakon što se lice pronađe (i nakon duljeg
  gubitka lica); `N` ga ručno postavlja na trenutni položaj glave.
- **Vodoravni pomak glave → azimut** s pojačanjem: zadano ~20 cm = ~75° orbite, najviše ±90°. Pomakneš
  glavu udesno → kamera ide udesno oko objekta, kao da hodaš oko njega, sve do profila.
- **Okomiti pomak → elevacija** (manje pojačanje, najviše ±30°).
- **Udaljenost glave → dolly**: nagneš se naprijed = kamera bliže i objekt raste; odmakneš se = dalje.
  Koristi se *relativna* promjena prema neutralnom položaju (raspon ~0,6× – 1,6×), pa je stabilno.
- **Krivulja odziva:** mala mrtva zona u centru, mekani prijelaz, zatim glatka krivulja s mekim limitom
  (tanh) na rubovima umjesto naglog zaustavljanja.
- **Kretanje** ide kroz kritično prigušenu oprugu: ima težinu i inerciju, bez podrhtavanja i bez osjetnog
  kašnjenja. Kamera ne može u pod, strop ni kroz zidove studija.
- U neutralnom položaju ORBIT kreće iz istog kadra koji WINDOW daje za glavu u sredini na ~60 cm, a orbita
  kruto okreće taj kadar oko točke interesa (ona ostaje na istom mjestu na ekranu). Prijelaz tipkom `M` zato
  je gotovo bez skoka.
- Panel `T` podešava sve uživo (pojačanje azimuta, maks. kut, pojačanje i maks. elevacije, raspon i
  osjetljivost zooma, mrtvu zonu, krutost opruge); vrijednosti se pamte u pregledniku.
- `D` debug overlay prikazuje azimut, elevaciju i zoom.

### WINDOW

Fizički točna off-axis projekcija: ekran je prozor, a kamera je točno na tvom oku.
Kao kroz pravi prozor, kad se odmakneš, objekt iza stakla na ekranu postaje *veći* (prozor zauzima manji
kut, a objekt ostaje gdje jest), a pomak glave u stranu mijenja kut gledanja samo onoliko koliko bi ga
mijenjao i u stvarnosti — uvjerljivo, ali suptilno.

**Robot u LOOK AROUND (ORBIT)** stoji mirno (glava i tijelo se ne okreću), pa mu možeš vidjeti profil. Oči
ga prate samo dok si unutar ~±25° od fronte, a dalje se glatko vrate i gledaju naprijed. Za testove postoje
i ostala ponašanja pogleda (`__ht.setGazeMode`): (2) oči uvijek prate do granice rotacije oka, (3) glava i
oči prate (u WINDOW načinu s pojačanim okretom).

## Upute, potpis i sučelje

- **Upute** (engleski) iznad gumba, jedna po jedna, izmjenjuju se svakih ~3,4 s: *Move your head*,
  *Point at its face*, *Open your palm*. Kad gestu prvi put uspješno napraviš, uputa dobije kvačicu i više
  se ne pojavljuje (glava: pomak ~7 cm; kažiprst: oči drže prst ~0,35 s; dlan: robot se vidljivo rastavi).
  Kreću ~2,6 s nakon što se robot pojavi, i krenu ispočetka pri svakom učitavanju stranice.
- **Potpis** *Artificial Media* u donjem desnom kutu (na mobitelu gore desno) vodi na
  [instagram.com/artificial_media_studio](https://instagram.com/artificial_media_studio).
- Sve poruke na ekranu (status, obavijesti, HUD) su na engleskom; kalibracijski i ORBIT panel te debug
  overlay ostali su na hrvatskom (alati za podešavanje).
- `U` skriva sve odjednom: HUD, gumb, upute, potpis i obavijesti.

Studio je proširen da i bok izgleda kao front: robot stoji u studiju s cikloramom, a softboxovi na stalcima
su na mjestima stvarnih svjetala (izvan putanje kamere).

## Mobitel

Mobitel/tablet se prepoznaje po pregledniku (iPhone, Android, Instagram/Facebook preglednik) ili po dodiru kao
glavnom pokazivaču bez hovera (iPad). Sve ispod vrijedi **samo na mobitelu** (`src/device.js`, klasa
`is-mobile` na `<html>`); na računalu prikaz, kalibracija i ponašanje ostaju kao prije.

- **Mjere ekrana:** umjesto MacBook Aira stvarna veličina prozora iz CSS piksela (~150 CSS px po inču za
  mobitel, ~132 za tablet), pa robot nije stisnut ni u uspravnom ni u položenom položaju. Prednja kamera:
  ~70° vidnog polja po duljoj strani slike (u uspravnoj slici se računa uži vodoravni kut), ~1 cm iznad
  gornjeg ruba (uspravno) ili sa strane (položeno, prema `screen.orientation`). Mobitel se drži bliže:
  mirovanje je na 35 cm umjesto 60. Jer položaj kamere i držanje mobitela nisu poznati točno, "ravno ispred"
  je tamo gdje je lice bilo kad je pronađeno (isti neutralni položaj kao za ORBIT, glatko).
- **Kadar:** mjerilo robota prati visinu prozora kao na računalu (bez donje granice); u položenom položaju
  ×0,7, da glava i tamo zauzme oko pola visine kadra.
- **Brzo učitavanje:** geometrija robota za mobitel izračunata je unaprijed pri buildu (`npm run bake`, poziva ga
  i `npm run build` / `dev`; skripta `scripts/bake-mobile.mjs`) u grubljoj razini — 60k umjesto 228k trokuta,
  komprimirano meshoptimizerom u `public/mobile/robot.bin` (0,33 MB). Isto tako i studijski HDRI smanjen na 1k
  (`public/mobile/studio_1k.hdr`, 1,6 MB umjesto 6,4 MB). Mobitel to samo preuzme i dekodira — nema SDF workera.
  Generirane datoteke nisu u gitu (stvaraju se pri svakom buildu, i u GitHub Actions).
- **Ekran za učitavanje** na mobitelu pokazuje stvarni napredak: preuzeti bajtovi (80 %), sastavljanje robota,
  kompajliranje shadera i prvi frameovi.
- **Kamera** prati samo lice (model za ruke se ne učitava; ruke zamjenjuju geste dodirom), slika 640×360 na
  30 fps, detekcija lica najviše 20 puta u sekundi; kamera (i MediaPipe) kreće tek kad je robot na ekranu, da
  ne otima mrežu i procesor robotu.
- **Kvaliteta:** profil `mobile` — bez ambijentalne okluzije (N8AO) i bez PCSS-a (obične PCF sjene, mape
  512 / 256), bloom s 4 razine, lakša volumetrija, SMAA low, bez MSAA na platnu, okolina 256. Render kreće s
  pixel ratio 1; dinamička rezolucija ga diže do 1,5 kad uređaj može, a spušta do 0,6 kad ne može. Proračun prati stvarni ritam zaslona (u štednji baterije preglednik crta
  na 30 Hz), a kad ni najniža rezolucija ne drži 60 fps (35–55 fps, trzanje), prelazi na stabilnih 30 fps.
- **Dodir (bez kamere, ili dok se kamera pokreće):** povlačenje jednim prstom glumi glavu (cijela širina
  ekrana ≈ ±18 cm), kratki dodir je prst koji dotakne to mjesto (lice → trzaj), držanje prsta na licu ~2 s →
  ljutnja, širenje dva prsta rastavlja (količina prati širenje), skupljanje sklapa. Dodir i dva prsta rade i
  kad kamera radi (tada povlačenje vodi prst, a ne glavu).
- **Upute** bez kamere: *Drag to move around*, *Tap its face*, *Spread two fingers* i, dok je robot rastavljen,
  *Pinch to put it back*; kad kamera proradi, prelaze na upute za kameru.
- **Bez kamere** (odbijena, nema je, ili se ne javi 8 s — čest slučaj u Instagramovom pregledniku): mala poruka
  *With your camera, the robot follows your face.* s gumbom **Try again**; u Instagramovom/Facebookovom
  pregledniku i savjet da se stranica otvori u Safariju ili Chromeu.
- **Sučelje za prst:** gumb načina 48 px visok, *Try again* i potpis s dodirnom površinom od 44 px. Uspravno:
  status i potpis gore, gumb i uputa dolje; položeno: gumb lijevo dolje, uputa desno dolje, robot u sredini.
  Ništa od toga ne prekriva robotovu glavu. Stranica se ne zumira i ne pomiče prstima.

## Kalibracija

Efekt je uvjerljiv samo ako program zna **stvarne fizičke mjere**. Pritisni `C`:

1. **Širina i visina ekrana** — vidljiva površina slike u cm, bez okvira.
   Zadano je MacBook Air 13" (28,9 × 18,8 cm). Ako nemaš metar, klikni
   **Izmjeri karticom**, prisloni bankovnu karticu na ekran i povlači klizač dok se
   širina pravokutnika ne poklopi s karticom.
2. **Kamera iznad ruba** — koliko je centar kamere iznad gornjeg ruba slike (MacBook: ~0,6 cm).
3. **FOV kamere** — horizontalni kut web kamere (zadano 60°). Sjedni na izmjerenu udaljenost
   (npr. 50 cm metrom od ekrana do očiju) i gledaj vrijednost *Izmjereno sada* u panelu:
   ako pokazuje premalo, smanji FOV; ako previše, povećaj.
4. **Razmak zjenica** — zadano 63 mm; svoj IPD možeš izmjeriti ravnalom pred ogledalom.
5. **Zaglađivanje / brzina odziva** — parametri One Euro filtra. Manji *min cutoff* = mirnija
   slika; veća *beta* = manje kašnjenja kod brzih pokreta.
6. **Jačina stereo efekta** — skalira razmak lijeve/desne kamere u anaglif načinu.

Postavke se spremaju u `localStorage` preglednika. Na mobitelu se mjere ekrana i kamere ne uzimaju iz panela,
nego iz uređaja (vidi [Mobitel](#mobitel)).

Najtočnije je u **fullscreenu** (`F`). U prozoru se položaj prozora na ekranu procjenjuje
iz `window.screenX/Y`, pa je "prozor u svijet" upravo onaj dio ekrana koji prozor zauzima.

## Savjeti za najjači efekt

- **Zatvori jedno oko.** Mozak tada nema stereo informaciju koja "otkriva" da je slika
  ravna, pa paralaksa pokreta postaje jedini znak dubine — efekt je dramatično jači.
  U panelu možeš odabrati *Gledaj iz oka: lijevo/desno* da projekcija bude točno iz tog oka.
- **Dobra rasvjeta lica**, svjetlo sprijeda, bez jakog protusvjetla iza tebe.
- **Sjedni 40–80 cm od ekrana** i pomiči glavu polako lijevo-desno i gore-dolje.
- **Snimanje mobitelom:** drži mobitel u ruci tik uz glavu (objektiv što bliže oku) i pomiči
  se zajedno s njim — kamera tada vidi ono što vidi tvoje oko, pa snimka izgleda kao pravi 3D.
- Za anaglif (`S`) trebaju crveno-cijan naočale (crveno na lijevom oku).

## Kvaliteta i performanse

- Render: AgX tone mapping, sRGB, fizikalne jedinice svjetla (scena je u cm, intenziteti su skalirani),
  PMREM okolina iz **Poly Haven HDRI-ja** (`ferndale_studio_11`) kojem se pod zatamni i dodaju
  softbox trake — kao kartice i zastavice u produktnoj fotografiji.
- Postprocessing (pmndrs): **N8AO** ambijentalna okluzija, volumetrijski snop, **selektivni bloom** (samo
  emisivni dijelovi: oči, LED-ice, svjetla unutrašnjosti), **SMAA**, suptilni film grain i vinjeta.
  Bez dubinske oštrine — off-axis projekcija mora ostati oštra.
- Sjene: **PCSS** (meke sjene koje su oštre uz dodir) za spot svjetla.
- `Q` high: render na nativnoj rezoluciji panela (DPR 1,75 ≈ 2560×1664 na MacBook Airu) uz
  **dinamičku rezoluciju** koja drži 60 fps (spušta render scale do 1,25 ako treba, pa ga vraća).
  `Q` low: DPR 1 i lakši efekti.
- Geometrija glave i poprsja generira se u dva pozadinska workera odmah pri otvaranju stranice; za to
  vrijeme glavna nit jednom provuče prazan frame kroz postprocessing (kompajliraju se njegovi shaderi),
  a shaderi robota kompajliraju se paralelno dok je ekran za učitavanje još gore.

## Kako radi

- **Praćenje** (`src/tracking/`): FaceLandmarker daje središta šarenica (landmarke 468 i 473); lice i ruke
  detektiraju se u dva web workera (vidi Praćenje ruku).
  Udaljenost od ekrana procjenjuje se pinhole modelom iz razmaka zjenica u pikselima,
  `z = f · IPD / d`, gdje je `f` fokalna duljina iz horizontalnog FOV-a kamere; projicirani
  razmak korigira se za okret glave (yaw) iz transformacijske matrice lica. X/Y slijede iz
  položaja u kadru i pretvaraju se u cm u koordinatni sustav ekrana (ishodište = centar
  ekrana, kamera iznad gornjeg ruba). Signal se zaglađuje **One Euro** filterom.
  Kad se lice izgubi, pogled se glatko vraća u centar.
- **Projekcija** (`src/projection/`): Kooima *generalized perspective projection* — kamera stoji
  na položaju oka, a asimetrični frustum prolazi točno kroz rubove fizičkog ekrana (WINDOW način).
  Ravnina ekrana je `z = 0`; objekti iza ekrana imaju negativan z, ispred pozitivan.
- **Orbit** (`src/camera/orbitController.js`): kalibracija neutralnog položaja, krivulja odziva, kritično
  prigušena opruga, ograničenja prostora i stereo s nultom paralaksom na objektu (ORBIT način).
- **Stereo** (`src/render/anaglyph.js`): scena se crta dvaput, iz stvarnog položaja lijevog i
  desnog oka (uzimajući u obzir nagib glave), i spaja u crveno (lijevo) / cijan (desno).
- **Robot** (`src/scenes/robot/`): sastavljanje, materijali, oči, pogled, vrat, unutrašnjost i rastavljanje;
  `src/scenes/loaders.js` učitava vlastitu glavu. Jedinice scene su centimetri.
- **Render** (`src/render/`): postprocessing pipeline, PCSS zakrpa shadera, volumetrijski snop, studijska
  okolina iz HDRI-ja, materijali i tekst u prstenu objektiva.
- **Geometrija** (`src/geometry/`): SDF primitive, marching cubes s narrow-band blokovima, worker s
  meshoptimizer simplifikacijom; modeli glave i poprsja robota.
- **Sučelje** (`src/ui/`): ekran za učitavanje, gumb načina (`modeSwitch.js`), upute (`hints.js`), poruka bez
  kamere (`cameraNote.js`), HUD, debug overlay, kalibracijski i ORBIT panel, ispuštanje modela.
- **Mobitel** (`src/device.js`, `src/tracking/touchInput.js`): prepoznavanje uređaja, mjere ekrana i kamere,
  dodir koji glumi glavu i ruku (isti oblik traga kao miš/kamera, pa ga robot ne razlikuje).

### Praćenje ruku

- MediaPipe **HandLandmarker** (do 2 ruke) uz FaceLandmarker, ista web kamera. Lice i ruke rade u dva
  **web workera** (`src/tracking/vision.js`, `visionWorker.js`), pa render nikad ne čeka detekciju. Novi frame
  kamere šalje se tek kad je render predao svoj frame GPU-u, a dinamička rezolucija gleda i ritam
  detekcije: ako detekcija gladuje (GPU dijeli s renderom), render spusti rezoluciju umjesto da izgubi praćenje.
- **Ruka u 3D** (`src/interaction/handInput.js`): položaj u kadru → NDC ekrana → zraka iz trenutne kamere (radi
  i u ORBIT načinu). Dubina dolazi iz veličine dlana (pinhole; širina dlana ~8,5 cm, metrički "world" landmarki
  pa okret ruke ne smeta), relativno na udaljenost glave: ruka u neutralnom položaju drži točku ispred objekta,
  primicanje ekranu je gura prema objektu. **One Euro** filter + glatka interpolacija na 60 fps.
- **Geste** (`src/tracking/gestures.js`) s histerezom, vremenom potvrde i cooldownom: ispruženi kažiprst, pinch,
  otvoren dlan, šaka (oboje iz otvorenosti ruke, bez palca), brzi tap prema kameri, okvir od dvije ruke.
  Otvorenost ruke 0–1 kontinuirano upravlja rastavljanjem (`src/interaction/openControl.js`).
  Robot reagira na ispruženi kažiprst, dodir, otvoren dlan, šaku i okvir; pinch i tap se i dalje prepoznaju
  (vidi debug overlay `D`), ali robot na njih ne reagira.
- Kad ruka zakloni oči, položaj glave se zadrži, a kad se lice opet vidi, kamera glatko nastavi.

- **Ruke u sceni:** robot (`src/scenes/robot/`: `explode.js` redoslijed i opruge rastavljanja, `internals.js`
  unutarnja mehanika, `cooling.js` dijelovi tekućeg hlađenja i shader tekućine, `connectors.js` utikači,
  priključci i kabeli (instancirani po prostoru), `neck.js` vrat, `layout.js` točke spajanja vrata, `inspect.js`
  automatske provjere; kavezi glave i poprsja u `geometry/robotModels.js`) i redateljski okvir
  (`src/interaction/directorFrame.js`).

### Test API

Za automatske testove (Playwright) stranica izlaže `window.__ht`: `setHead([x, y, z])` (položaj glave u cm
od centra prozora, `null` vraća praćenje), `setQuality('high'|'low')`, `setStereo(bool)`,
`setCameraMode('orbit'|'window'|'fixed')`, `setOrbit({ az, el, zoom })` (orbita bez glave; `null` vraća upravljanje),
`setViewMode('follow'|'look')` (FOLLOW ME / LOOK AROUND, kao gumb), `setCameraHead([x, y, z])` (položaj glave kao s kamere — prolazi kroz neutralni položaj i
ponašanje FOLLOW ME s kamerom; `null` vraća pravu kameru), `setFollow({ headGain, headMax, eyeLock })` i
`follow` (postavke panela T, bez spremanja), `state().eyeContactDeg` (kut između pogleda i smjera prema
render kameri), `setGazeMode(1|2|3)` (pogled za trenutni
način kamere), `blink()` (okini zatvarač odmah), `hints` (upute: `isDone(id)`, `items`), `benchmark(n)` (ms po
frameu bez vsynca), `robot` (objekt scene; `robot.wake()` ponovno budi oči; `robot.explodeTarget` 0–1 rastavlja;
`robot.connectionReport()`, `robot.fitReport()`, `robot.clearanceReport()` — provjere unutrašnjosti) i `state()` (`phase`: `loading` →
`compiling` → `live`; `ready`: robot je na ekranu; `viewMode`, `cameraMode`, `gazeMode`, `headYawDeg` — okret
glave u stupnjevima, `cross` — koliko su oči prekrižene, 0–1; `mobile`, `halfRate` — 30 fps način,
`cameraFailed`, `cameraNote`). Za mobilne testove: `camera` (render kamera, za projekciju točaka na ekran),
`touch` (stanje dodira) i `setFrameCost(ms)` (umjetni trošak framea — simulacija slabog uređaja).
Ruke: `setHand({ tip: [x, y], r, gesture, spread, open, fingers, edge, frame })` (`open` = otvorenost 0–1 kao s
kamere — prolazi kroz glađenje, mrtve zone, magnet i držanje; `gesture: 'away'` = kamera izgubi ruku; `state().explode`
i `state().open` = cilj/napredak rastavljanja i stanje upravljanja; NDC vrha prsta, `r` = udaljenost ruke / udaljenost
glave, 0,62 je neutralno; `frame: [x0, y0, x1, y1]` = okvir od dvije ruke u NDC; `null` vraća kameru/miš),
`tap([x, y])`, `markers(bool)` i `hand()` (trenutno stanje).
Vrijeme učitavanja: `performance` oznake `robot:first-frame` (prvi frame robota, još ispod ekrana za
učitavanje) i `robot:revealed` (početak odtapanja).

## Zasluge

- HDRI `ferndale_studio_11` (Dimitrios Savva, Greg Zaal) — [Poly Haven](https://polyhaven.com), CC0.
- Font Barlow Condensed — SIL Open Font License.
- pmndrs `postprocessing` (Zlib), N8AO (ISC), meshoptimizer (MIT).
- Face Landmarker i Hand Landmarker modeli: Google MediaPipe (Apache 2.0).
- Ideja: Johnny Chung Lee, *Head Tracking for Desktop VR Displays using the Wii Remote* (2007);
  Robert Kooima, *Generalized Perspective Projection* (2008).
