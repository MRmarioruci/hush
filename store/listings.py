# Writes Play Store listing text per language into store/listings/<locale>/ and
# checks Play's length limits (title 30, short 80, full 4000 characters).
import os
L = {}

L["en-US"] = ("hush: white noise & monitor",
"White noise, nap times by age and a two-phone baby monitor. No subscription.",
"""No white noise machine or baby monitor? You don't need one. hush turns the phones you already have into all your baby-sleep helpers: calm white noise kept gentle at the crib, nap times suggested for your baby's age, and a baby monitor that alerts your phone when your baby cries. Use one, or all three. Pick what you need on each phone.

White noise and nap times are free. Try the baby monitor free for 4 days, then unlock it once. No subscription.

WHITE NOISE, KEPT GENTLE
• Twelve sounds: womb, shush, rain, ocean, stream, fan, hair dryer, car ride, a music-box lullaby, and white, pink and brown noise
• Tell hush how far the phone is from the crib and it keeps the sound under 50 dB there, the limit recommended for hospital nurseries
• While hush plays, your phone's volume can't go past that line
• Smart mode starts a little louder, then eases down once your baby has settled, and turns back up if crying starts
• Sleep timer with a soft fade-out
• Keeps playing with the screen off

NAP TIMES BY AGE
• See how long your baby has been awake and when the next nap or bedtime is likely
• Suggestions start from the usual awake times for your baby's age and lean toward your baby's own rhythm
• Log sleeps with one tap, or add and edit them later
• A gentle reminder before the best window
• What's typical at this age: awake times, naps a day, total sleep and sleepy signs

A BABY MONITOR WITH TWO PHONES
• Leave one phone in the baby's room. It listens for crying, right on the phone
• Scan its code with your own phone to pair. Several parents can pair
• Get an alert when your baby cries: right away, after 10 seconds or after a minute of crying
• Choose how sensitive it is
• Alerts when the baby's phone battery runs low or it stops listening

SLEEP LOG
• Every nap and night on a 24-hour timeline, with crying when the monitor was on
• Compare each day with what's typical for your baby's age
• Weekly and monthly views with trends
• Logged sleeps show up on all your connected phones
• A short morning summary on your phone

PRIVATE BY DESIGN
• Sound is checked on the phone and never recorded or uploaded
• No account, no tracking
• Sleep history stays on your phones

Available in English, Ελληνικά, Deutsch, Français, Español, Português and 中文.

hush is a helper, not a medical device. Always check on your baby yourself. Volume levels are estimates and vary between phones.""")

L["el-GR"] = ("hush: λευκός θόρυβος & ακρόαση",
"Λευκός θόρυβος, υπνάκοι ανά ηλικία και ακρόαση με δύο κινητά. Χωρίς συνδρομή.",
"""Δεν έχετε συσκευή λευκού θορύβου ή ενδοεπικοινωνία μωρού; Δεν χρειάζεστε. Το hush κάνει τα κινητά που ήδη έχετε όλους τους βοηθούς σας για τον ύπνο του μωρού: ήρεμο λευκό θόρυβο σε ήπια ένταση στην κούνια, ώρες για υπνάκο ανάλογα με την ηλικία του μωρού και ακρόαση μωρού που σας ειδοποιεί όταν κλαίει. Χρησιμοποιήστε έναν ή και τους τρεις. Επιλέξτε τι χρειάζεστε σε κάθε κινητό.

Ο λευκός θόρυβος και οι ώρες για υπνάκο είναι δωρεάν. Δοκιμάστε την ακρόαση δωρεάν για 4 μέρες και ξεκλειδώστε τη μία φορά. Χωρίς συνδρομή.

ΛΕΥΚΟΣ ΘΟΡΥΒΟΣ, ΠΑΝΤΑ ΑΠΑΛΟΣ
• Δώδεκα ήχοι: μήτρα, σςς, βροχή, θάλασσα, ρυάκι, ανεμιστήρας, πιστολάκι, βόλτα με αμάξι, νανούρισμα με μουσικό κουτί, και λευκός, ροζ και καφέ θόρυβος
• Πείτε στο hush πόσο μακριά είναι το κινητό από την κούνια και κρατά τον ήχο κάτω από 50 dB εκεί, το όριο που προτείνεται για τα νεογνικά τμήματα
• Όσο παίζει, η ένταση του κινητού δεν περνά αυτό το όριο
• Η έξυπνη λειτουργία ξεκινά λίγο πιο δυνατά, χαμηλώνει όταν το μωρό ηρεμήσει και δυναμώνει ξανά αν αρχίσει να κλαίει
• Χρονόμετρο ύπνου με απαλό σβήσιμο
• Συνεχίζει με κλειστή οθόνη

ΥΠΝΑΚΟΙ ΑΝΑ ΗΛΙΚΙΑ
• Δείτε πόση ώρα είναι ξύπνιο το μωρό και πότε έρχεται μάλλον ο επόμενος υπνάκος ή ο βραδινός ύπνος
• Οι προτάσεις ξεκινούν από τους συνηθισμένους χρόνους εγρήγορσης για την ηλικία του μωρού και προσαρμόζονται στον δικό του ρυθμό
• Καταγράψτε τον ύπνο με ένα πάτημα ή προσθέστε και διορθώστε τον αργότερα
• Μια διακριτική υπενθύμιση πριν από το καλύτερο χρονικό παράθυρο
• Τι είναι συνηθισμένο σε αυτή την ηλικία: χρόνοι εγρήγορσης, υπνάκοι την ημέρα, συνολικός ύπνος και σημάδια νύστας

ΑΚΡΟΑΣΗ ΜΩΡΟΥ ΜΕ ΔΥΟ ΚΙΝΗΤΑ
• Αφήστε ένα κινητό στο δωμάτιο του μωρού. Ακούει για κλάμα, μέσα στο ίδιο το κινητό
• Σκανάρετε τον κωδικό του με το δικό σας κινητό για σύνδεση. Μπορούν να συνδεθούν πολλοί γονείς
• Ειδοποίηση όταν κλαίει: αμέσως, μετά από 10 δευτερόλεπτα ή μετά από ένα λεπτό
• Επιλέξτε την ευαισθησία
• Ειδοποίηση όταν πέφτει η μπαταρία ή σταματά η ακρόαση

ΗΜΕΡΟΛΟΓΙΟ ΥΠΝΟΥ
• Κάθε υπνάκος και κάθε νύχτα σε χρονογραμμή 24 ωρών, με το κλάμα όταν ήταν ανοιχτή η ακρόαση
• Συγκρίνετε κάθε μέρα με ό,τι είναι συνηθισμένο για την ηλικία του μωρού
• Εβδομαδιαία και μηνιαία εικόνα με τάσεις
• Οι καταγραφές ύπνου εμφανίζονται σε όλα τα συνδεδεμένα κινητά σας
• Σύντομη πρωινή σύνοψη στο κινητό σας

ΙΔΙΩΤΙΚΟΤΗΤΑ
• Ο ήχος ελέγχεται στο κινητό και δεν ηχογραφείται ούτε ανεβαίνει πουθενά
• Χωρίς λογαριασμό και χωρίς παρακολούθηση
• Το ιστορικό ύπνου μένει στα κινητά σας

Διαθέσιμο σε English, Ελληνικά, Deutsch, Français, Español, Português και 中文.

Το hush είναι βοήθημα, όχι ιατρική συσκευή. Να ελέγχετε πάντα το μωρό και μόνοι σας. Οι εντάσεις είναι εκτιμήσεις και διαφέρουν ανά κινητό.""")

L["de-DE"] = ("hush: Rauschen & Babyphone",
"Rauschen, Schläfchenzeiten nach Alter und Babyphone mit zwei Handys. Ohne Abo.",
"""Kein Rauschgerät und kein Babyphone? Brauchen Sie nicht. hush macht aus den Handys, die Sie schon haben, alle Helfer für den Babyschlaf: beruhigendes Rauschen, das am Babybett leise bleibt, Schläfchenzeiten passend zum Alter Ihres Babys und ein Babyphone, das Ihr Handy benachrichtigt, wenn Ihr Baby weint. Nutzen Sie einen oder alle drei. Wählen Sie auf jedem Handy, was Sie brauchen.

Rauschen und Schläfchenzeiten sind kostenlos. Das Babyphone 4 Tage gratis testen, dann einmal freischalten. Kein Abo.

RAUSCHEN, IMMER SANFT
• Zwölf Klänge: Bauch, Schhh, Regen, Meer, Bach, Ventilator, Föhn, Autofahrt, Spieluhr sowie weißes, rosa und braunes Rauschen
• Sagen Sie hush, wie weit das Handy vom Bett entfernt ist, und es bleibt dort unter 50 dB, dem für Säuglingsstationen empfohlenen Grenzwert
• Während hush spielt, kann die Handylautstärke diese Grenze nicht überschreiten
• Der smarte Modus startet etwas lauter, wird leiser, sobald Ihr Baby ruhig ist, und wieder lauter, wenn es weint
• Schlaftimer mit sanftem Ausblenden
• Spielt auch bei ausgeschaltetem Bildschirm weiter

SCHLÄFCHEN NACH ALTER
• Sehen Sie, wie lange Ihr Baby schon wach ist und wann das nächste Schläfchen oder die Schlafenszeit wahrscheinlich ist
• Die Vorschläge gehen von den üblichen Wachzeiten für das Alter Ihres Babys aus und passen sich seinem eigenen Rhythmus an
• Schlaf mit einem Tippen eintragen oder später hinzufügen und bearbeiten
• Eine sanfte Erinnerung vor dem besten Zeitfenster
• Was in diesem Alter typisch ist: Wachzeiten, Schläfchen pro Tag, Gesamtschlaf und Müdigkeitszeichen

BABYPHONE MIT ZWEI HANDYS
• Ein Handy bleibt im Babyzimmer und hört direkt auf dem Gerät auf Weinen
• Scannen Sie seinen Code mit Ihrem Handy, um zu verbinden. Mehrere Eltern können sich verbinden
• Benachrichtigung, wenn Ihr Baby weint: sofort, nach 10 Sekunden oder nach einer Minute
• Empfindlichkeit wählbar
• Hinweis, wenn der Akku des Baby-Handys schwach wird oder es nicht mehr zuhört

SCHLAFPROTOKOLL
• Jedes Schläfchen und jede Nacht auf einer 24-Stunden-Zeitleiste, mit Weinen, wenn das Babyphone an war
• Vergleichen Sie jeden Tag mit dem, was für das Alter Ihres Babys typisch ist
• Wochen- und Monatsansicht mit Trends
• Eingetragener Schlaf erscheint auf allen verbundenen Handys
• Eine kurze Zusammenfassung am Morgen

PRIVAT VON ANFANG AN
• Geräusche werden auf dem Handy geprüft, nie aufgenommen oder hochgeladen
• Kein Konto, kein Tracking
• Der Schlafverlauf bleibt auf Ihren Handys

Verfügbar auf English, Ελληνικά, Deutsch, Français, Español, Português und 中文.

hush ist eine Hilfe, kein Medizinprodukt. Schauen Sie immer auch selbst nach Ihrem Baby. Lautstärkewerte sind Schätzungen und je nach Handy verschieden.""")

L["fr-FR"] = ("hush : bruit blanc & babyphone",
"Bruit blanc, siestes par âge et babyphone à deux téléphones. Sans abonnement.",
"""Pas de machine à bruit blanc ni de babyphone ? Pas besoin. hush transforme les téléphones que vous avez déjà en alliés pour le sommeil de bébé : un bruit blanc apaisant, modéré près du lit, des heures de sieste suggérées selon l'âge de bébé, et un babyphone qui vous alerte quand bébé pleure. Utilisez-en un, ou les trois. Choisissez ce dont vous avez besoin sur chaque téléphone.

Le bruit blanc et les heures de sieste sont gratuits. Essayez le babyphone 4 jours gratuitement, puis débloquez-le une fois. Sans abonnement.

UN BRUIT BLANC TOUJOURS DOUX
• Douze sons : ventre, chut, pluie, océan, ruisseau, ventilateur, sèche-cheveux, voiture, berceuse en boîte à musique, et bruit blanc, rose et brun
• Indiquez à quelle distance du lit se trouve le téléphone : hush garde le son sous 50 dB à cet endroit, la limite recommandée pour les maternités
• Pendant la lecture, le volume du téléphone ne peut pas dépasser cette limite
• Le mode intelligent démarre un peu plus fort, baisse quand bébé s'est calmé et remonte s'il se met à pleurer
• Minuteur avec fondu en douceur
• Continue écran éteint

LES SIESTES SELON L'ÂGE
• Voyez depuis combien de temps bébé est éveillé et quand viendra sans doute la prochaine sieste ou l'heure du coucher
• Les suggestions partent des temps d'éveil habituels à l'âge de bébé et s'adaptent à son propre rythme
• Notez un sommeil d'un geste, ou ajoutez-le et modifiez-le plus tard
• Un rappel en douceur avant le meilleur moment
• Ce qui est typique à cet âge : temps d'éveil, siestes par jour, sommeil total et signes de fatigue

UN BABYPHONE AVEC DEUX TÉLÉPHONES
• Laissez un téléphone dans la chambre : il écoute les pleurs directement sur l'appareil
• Scannez son code avec votre téléphone pour les associer. Plusieurs parents peuvent se connecter
• Alerte quand bébé pleure : tout de suite, après 10 secondes ou après une minute
• Sensibilité réglable
• Alerte si la batterie du téléphone de bébé faiblit ou s'il arrête d'écouter

LE JOURNAL DE SOMMEIL
• Chaque sieste et chaque nuit sur une frise de 24 heures, avec les pleurs quand le babyphone était allumé
• Comparez chaque journée à ce qui est typique à l'âge de bébé
• Vues semaine et mois avec tendances
• Les sommeils notés apparaissent sur tous vos téléphones connectés
• Un petit résumé le matin

PRIVÉ PAR NATURE
• Le son est analysé sur le téléphone, jamais enregistré ni envoyé
• Pas de compte, pas de suivi
• L'historique de sommeil reste sur vos téléphones

Disponible en English, Ελληνικά, Deutsch, Français, Español, Português et 中文.

hush est une aide, pas un dispositif médical. Allez toujours voir votre bébé vous-même. Les niveaux sonores sont des estimations et varient selon les téléphones.""")

L["es-ES"] = ("hush: ruido blanco y monitor",
"Ruido blanco, siestas por edad y vigilabebés con dos móviles. Sin suscripción.",
"""¿No tienes máquina de ruido blanco ni vigilabebés? No te hace falta. hush convierte los móviles que ya tienes en todos tus ayudantes para el sueño del bebé: ruido blanco relajante y suave en la cuna, horas de siesta sugeridas según la edad de tu bebé y un vigilabebés que te avisa cuando tu bebé llora. Usa uno, o los tres. Elige lo que necesitas en cada móvil.

El ruido blanco y las horas de siesta son gratis. Prueba el vigilabebés 4 días gratis y luego desbloquéalo una vez. Sin suscripción.

RUIDO BLANCO, SIEMPRE SUAVE
• Doce sonidos: vientre, chist, lluvia, mar, arroyo, ventilador, secador, coche, nana de cajita de música y ruido blanco, rosa y marrón
• Dile a hush a qué distancia está el móvil de la cuna y mantendrá el sonido por debajo de 50 dB allí, el límite recomendado para las salas de neonatos
• Mientras suena, el volumen del móvil no puede superar esa línea
• El modo inteligente empieza algo más alto, baja cuando el bebé se calma y vuelve a subir si empieza a llorar
• Temporizador con fundido suave
• Sigue sonando con la pantalla apagada

SIESTAS SEGÚN LA EDAD
• Mira cuánto tiempo lleva despierto tu bebé y cuándo tocará probablemente la próxima siesta o la hora de dormir
• Las sugerencias parten de los tiempos de vigilia habituales para la edad de tu bebé y se adaptan a su propio ritmo
• Registra el sueño con un toque, o añádelo y edítalo más tarde
• Un aviso suave antes del mejor momento
• Lo típico a esta edad: tiempos de vigilia, siestas al día, sueño total y señales de cansancio

VIGILABEBÉS CON DOS MÓVILES
• Deja un móvil en la habitación del bebé: escucha el llanto en el propio móvil
• Escanea su código con tu móvil para vincularlos. Pueden vincularse varios padres
• Aviso cuando el bebé llora: al momento, a los 10 segundos o al minuto
• Sensibilidad ajustable
• Aviso si la batería del móvil del bebé baja o deja de escuchar

REGISTRO DE SUEÑO
• Cada siesta y cada noche en una línea de tiempo de 24 horas, con el llanto cuando el vigilabebés estaba activado
• Compara cada día con lo típico para la edad de tu bebé
• Vistas semanales y mensuales con tendencias
• Lo que registres aparece en todos tus móviles conectados
• Un breve resumen por la mañana

PRIVADO DESDE EL PRINCIPIO
• El sonido se analiza en el móvil y nunca se graba ni se sube
• Sin cuenta y sin rastreo
• El historial de sueño se queda en tus móviles

Disponible en English, Ελληνικά, Deutsch, Français, Español, Português y 中文.

hush es una ayuda, no un dispositivo médico. Comprueba siempre tú mismo cómo está tu bebé. Los niveles de volumen son estimaciones y varían según el móvil.""")

L["pt-BR"] = ("hush: ruído branco e babá",
"Ruído branco, sonecas por idade, babá eletrônica em 2 celulares. Sem assinatura.",
"""Sem aparelho de ruído branco nem babá eletrônica? Você não precisa. O hush transforma os celulares que você já tem em todos os seus ajudantes para o sono do bebê: ruído branco relaxante e suave no berço, horários de soneca sugeridos para a idade do bebê e uma babá eletrônica que avisa você quando o bebê chora. Use um, ou os três. Escolha o que você precisa em cada celular.

O ruído branco e os horários de soneca são grátis. Experimente a babá eletrônica grátis por 4 dias e depois libere com uma compra única. Sem assinatura.

RUÍDO BRANCO, SEMPRE SUAVE
• Doze sons: barriga, shhh, chuva, mar, riacho, ventilador, secador, passeio de carro, canção de ninar de caixinha de música e ruído branco, rosa e marrom
• Diga ao hush a que distância o celular está do berço e ele mantém o som abaixo de 50 dB ali, o limite recomendado para berçários hospitalares
• Enquanto toca, o volume do celular não passa desse limite
• O modo inteligente começa um pouco mais alto, abaixa quando o bebê se acalma e aumenta de novo se ele começar a chorar
• Timer com desligamento suave
• Continua tocando com a tela desligada

SONECAS POR IDADE
• Veja há quanto tempo o bebê está acordado e quando a próxima soneca ou a hora de dormir deve chegar
• As sugestões partem do tempo acordado habitual para a idade do bebê e se ajustam ao ritmo dele
• Registre o sono com um toque, ou adicione e edite depois
• Um lembrete suave antes da melhor janela
• O que é típico nessa idade: tempo acordado, sonecas por dia, sono total e sinais de sono

BABÁ ELETRÔNICA COM DOIS CELULARES
• Deixe um celular no quarto do bebê: ele escuta o choro no próprio aparelho
• Escaneie o código dele com o seu celular para conectar. Vários pais podem se conectar
• Alerta quando o bebê chora: na hora, depois de 10 segundos ou depois de um minuto
• Sensibilidade ajustável
• Alerta quando a bateria do celular do bebê está fraca ou ele para de escutar

DIÁRIO DE SONO
• Cada soneca e cada noite em uma linha do tempo de 24 horas, com o choro quando a babá eletrônica estava ligada
• Compare cada dia com o que é típico para a idade do bebê
• Visões semanais e mensais com tendências
• O sono registrado aparece em todos os seus celulares conectados
• Um resumo rápido de manhã

PRIVADO DESDE O INÍCIO
• O som é analisado no celular e nunca é gravado nem enviado
• Sem conta e sem rastreamento
• O histórico de sono fica nos seus celulares

Disponível em English, Ελληνικά, Deutsch, Français, Español, Português e 中文.

O hush é uma ajuda, não um aparelho médico. Sempre confira o bebê você mesmo. Os níveis de volume são estimativas e variam entre celulares.""")

L["zh-CN"] = ("hush：白噪音与宝宝监听",
"白噪音、按月龄的小睡时间，以及两部手机的宝宝监听。无需订阅。",
"""没有白噪音机，也没有宝宝监视器？不需要。hush 把你现有的手机变成全套宝宝睡眠助手：在婴儿床边保持柔和音量的舒缓白噪音，按宝宝月龄建议的小睡时间，以及宝宝哭时提醒你的监听器。用一个，或三个都用。每部手机按需选择。

白噪音和小睡时间免费。宝宝监听可免费试用 4 天，之后一次性解锁。无需订阅。

柔和的白噪音
• 十二种声音：子宫、嘘声、雨声、海浪、小溪、风扇、吹风机、坐车、八音盒摇篮曲，以及白噪音、粉噪音和棕噪音
• 告诉 hush 手机离婴儿床多远，它会让床边的声音保持在 50 分贝以下，这是医院新生儿室推荐的上限
• 播放时，手机音量无法超过这条线
• 智能模式开始时稍大一些，宝宝安静后逐渐降低，开始哭时再调高
• 睡眠定时，结束时柔和淡出
• 关闭屏幕也能继续播放

按月龄安排小睡
• 查看宝宝已经醒了多久，以及下一次小睡或晚上入睡大概在什么时候
• 建议以宝宝月龄的常见清醒时长为起点，并逐渐贴合宝宝自己的节奏
• 一键记录睡眠，也可以之后添加和编辑
• 在最佳时段前温柔提醒
• 这个月龄的常见情况：清醒时长、每天小睡次数、总睡眠时长和困倦信号

两部手机即可监听
• 把一部手机放在宝宝房间，它直接在手机上识别哭声
• 用你的手机扫描它的二维码即可配对，可以配对多位家长
• 宝宝哭时提醒你：立即、哭 10 秒后或哭 1 分钟后
• 可调节灵敏度
• 宝宝手机电量低或停止监听时会提醒

睡眠记录
• 每次小睡和每个夜晚都显示在 24 小时时间线上，开启监听时还会显示哭声
• 将每一天与宝宝月龄的常见情况对比
• 每周和每月视图，显示趋势
• 记录的睡眠会显示在你所有已连接的手机上
• 早上收到一份简短总结

注重隐私
• 声音只在手机上分析，从不录音或上传
• 无需账号，无追踪
• 睡眠记录只保存在你的手机上

支持 English、Ελληνικά、Deutsch、Français、Español、Português 和中文。

hush 只是辅助工具，并非医疗设备。请始终亲自查看宝宝。音量数值为估算，不同手机会有差异。""")

base = os.path.join(os.path.dirname(__file__), "listings")
for loc, (title, short, full) in L.items():
    assert len(title) <= 30, (loc, "title", len(title))
    assert len(short) <= 80, (loc, "short", len(short))
    assert len(full) <= 4000, (loc, "full", len(full))
    d = os.path.join(base, loc); os.makedirs(d, exist_ok=True)
    for name, text in (("title", title), ("short_description", short), ("full_description", full)):
        open(os.path.join(d, name + ".txt"), "w").write(text.strip() + "\n")
    print(f"{loc}: title {len(title)}, short {len(short)}, full {len(full)}")
