# Writes Play Store listing text per language into store/listings/<locale>/ and
# checks Play's length limits (title 30, short 80, full 4000 characters).
import os
L = {}

L["en-US"] = ("hush: white noise & monitor",
"Turn your phones into a baby monitor, with gentle white noise. No subscription.",
"""No white noise machine or baby monitor? You don't need one. hush turns the phones you already have into both: calm white noise kept gentle at the crib, and a baby monitor that alerts your phone when your baby cries. White noise is free. Try the baby monitor free for 4 days, then unlock it once. No subscription.

WHITE NOISE, KEPT GENTLE
• Six loops: womb, shush, brown, pink, white and ocean
• Tell hush how far the phone is from the crib and it keeps the sound under 50 dB there, the limit recommended for hospital nurseries
• While hush plays, your phone's volume can't go past that line
• Smart mode starts a little louder, then eases down once your baby has settled, and turns back up if crying starts
• Sleep timer with a soft fade-out
• Keeps playing with the screen off

A BABY MONITOR WITH TWO PHONES
• Leave one phone in the baby's room. It listens for crying, right on the phone
• Scan its code with your own phone to pair. Several parents can pair
• Get an alert when your baby cries: right away, after 10 seconds or after a minute of crying
• Choose how sensitive it is
• Alerts when the baby's phone battery runs low or it stops listening

NIGHTS
• See each night on a timeline: when your baby cried, for how long, and the longest quiet stretch
• Weekly and monthly views with trends and the calmest nights
• A short morning summary on your phone

PRIVATE BY DESIGN
• Sound is checked on the phone and never recorded or uploaded
• No account, no tracking
• Night history stays on your phones

Available in English, Ελληνικά, Deutsch, Français, Español, Português and 中文.

hush is a helper, not a medical device. Always check on your baby yourself. Volume levels are estimates and vary between phones.""")

L["el-GR"] = ("hush: λευκός θόρυβος & ακρόαση",
"Τα κινητά σας γίνονται ενδοεπικοινωνία μωρού, με λευκό θόρυβο. Χωρίς συνδρομή.",
"""Δεν έχετε συσκευή λευκού θορύβου ή ενδοεπικοινωνία μωρού; Δεν χρειάζεστε. Το hush κάνει τα κινητά που ήδη έχετε και τα δύο: ήρεμο λευκό θόρυβο σε ήπια ένταση στην κούνια και ακρόαση μωρού που σας ειδοποιεί όταν κλαίει. Ο λευκός θόρυβος είναι δωρεάν. Δοκιμάστε την ακρόαση δωρεάν για 4 μέρες και ξεκλειδώστε τη μία φορά. Χωρίς συνδρομή.

ΛΕΥΚΟΣ ΘΟΡΥΒΟΣ, ΠΑΝΤΑ ΑΠΑΛΟΣ
• Έξι ήχοι: μήτρα, σςς, καφέ, ροζ, λευκός και θάλασσα
• Πείτε στο hush πόσο μακριά είναι το κινητό από την κούνια και κρατά τον ήχο κάτω από 50 dB εκεί, το όριο που προτείνεται για τα νεογνικά τμήματα
• Όσο παίζει, η ένταση του κινητού δεν περνά αυτό το όριο
• Η έξυπνη λειτουργία ξεκινά λίγο πιο δυνατά, χαμηλώνει όταν το μωρό ηρεμήσει και δυναμώνει ξανά αν αρχίσει να κλαίει
• Χρονόμετρο ύπνου με απαλό σβήσιμο
• Συνεχίζει με κλειστή οθόνη

ΑΚΡΟΑΣΗ ΜΩΡΟΥ ΜΕ ΔΥΟ ΚΙΝΗΤΑ
• Αφήστε ένα κινητό στο δωμάτιο του μωρού. Ακούει για κλάμα, μέσα στο ίδιο το κινητό
• Σκανάρετε τον κωδικό του με το δικό σας κινητό για σύνδεση. Μπορούν να συνδεθούν πολλοί γονείς
• Ειδοποίηση όταν κλαίει: αμέσως, μετά από 10 δευτερόλεπτα ή μετά από ένα λεπτό
• Επιλέξτε την ευαισθησία
• Ειδοποίηση όταν πέφτει η μπαταρία ή σταματά η ακρόαση

ΝΥΧΤΕΣ
• Κάθε νύχτα σε χρονογραμμή: πότε έκλαψε, για πόσο και το μεγαλύτερο ήσυχο διάστημα
• Εβδομαδιαία και μηνιαία εικόνα με τάσεις και τις πιο ήρεμες νύχτες
• Σύντομη πρωινή σύνοψη στο κινητό σας

ΙΔΙΩΤΙΚΟΤΗΤΑ
• Ο ήχος ελέγχεται στο κινητό και δεν ηχογραφείται ούτε ανεβαίνει πουθενά
• Χωρίς λογαριασμό και χωρίς παρακολούθηση
• Το ιστορικό μένει στα κινητά σας

Διαθέσιμο σε English, Ελληνικά, Deutsch, Français, Español, Português και 中文.

Το hush είναι βοήθημα, όχι ιατρική συσκευή. Να ελέγχετε πάντα το μωρό και μόνοι σας. Οι εντάσεις είναι εκτιμήσεις και διαφέρουν ανά κινητό.""")

L["de-DE"] = ("hush: Rauschen & Babyphone",
"Ihre Handys als Babyphone, dazu sanftes Einschlafrauschen. Ohne Abo.",
"""Kein Rauschgerät und kein Babyphone? Brauchen Sie nicht. hush macht aus den Handys, die Sie schon haben, beides: beruhigendes Rauschen, das am Babybett leise bleibt, und ein Babyphone, das Ihr Handy benachrichtigt, wenn Ihr Baby weint. Das Rauschen ist kostenlos. Das Babyphone 4 Tage gratis testen, dann einmal freischalten. Kein Abo.

RAUSCHEN, IMMER SANFT
• Sechs Klänge: Bauch, Schhh, Braun, Rosa, Weiß und Meer
• Sagen Sie hush, wie weit das Handy vom Bett entfernt ist, und es bleibt dort unter 50 dB, dem für Säuglingsstationen empfohlenen Grenzwert
• Während hush spielt, kann die Handylautstärke diese Grenze nicht überschreiten
• Der smarte Modus startet etwas lauter, wird leiser, sobald Ihr Baby ruhig ist, und wieder lauter, wenn es weint
• Schlaftimer mit sanftem Ausblenden
• Spielt auch bei ausgeschaltetem Bildschirm weiter

BABYPHONE MIT ZWEI HANDYS
• Ein Handy bleibt im Babyzimmer und hört direkt auf dem Gerät auf Weinen
• Scannen Sie seinen Code mit Ihrem Handy, um zu verbinden. Mehrere Eltern können sich verbinden
• Benachrichtigung, wenn Ihr Baby weint: sofort, nach 10 Sekunden oder nach einer Minute
• Empfindlichkeit wählbar
• Hinweis, wenn der Akku des Baby-Handys schwach wird oder es nicht mehr zuhört

NÄCHTE
• Jede Nacht als Zeitleiste: wann und wie lange Ihr Baby geweint hat und die längste ruhige Phase
• Wochen- und Monatsansicht mit Trends und den ruhigsten Nächten
• Eine kurze Zusammenfassung am Morgen

PRIVAT VON ANFANG AN
• Geräusche werden auf dem Handy geprüft, nie aufgenommen oder hochgeladen
• Kein Konto, kein Tracking
• Der Verlauf bleibt auf Ihren Handys

Verfügbar auf English, Ελληνικά, Deutsch, Français, Español, Português und 中文.

hush ist eine Hilfe, kein Medizinprodukt. Schauen Sie immer auch selbst nach Ihrem Baby. Lautstärkewerte sind Schätzungen und je nach Handy verschieden.""")

L["fr-FR"] = ("hush : bruit blanc & babyphone",
"Vos téléphones deviennent babyphone, avec un bruit blanc doux. Sans abonnement.",
"""Pas de machine à bruit blanc ni de babyphone ? Pas besoin. hush transforme les téléphones que vous avez déjà en l'un et l'autre : un bruit blanc apaisant, modéré près du lit, et un babyphone qui vous alerte quand bébé pleure. Le bruit blanc est gratuit. Essayez le babyphone 4 jours gratuitement, puis débloquez-le une fois. Sans abonnement.

UN BRUIT BLANC TOUJOURS DOUX
• Six sons : ventre, chut, brun, rose, blanc et océan
• Indiquez à quelle distance du lit se trouve le téléphone : hush garde le son sous 50 dB à cet endroit, la limite recommandée pour les maternités
• Pendant la lecture, le volume du téléphone ne peut pas dépasser cette limite
• Le mode intelligent démarre un peu plus fort, baisse quand bébé s'est calmé et remonte s'il se met à pleurer
• Minuteur avec fondu en douceur
• Continue écran éteint

UN BABYPHONE AVEC DEUX TÉLÉPHONES
• Laissez un téléphone dans la chambre : il écoute les pleurs directement sur l'appareil
• Scannez son code avec votre téléphone pour les associer. Plusieurs parents peuvent se connecter
• Alerte quand bébé pleure : tout de suite, après 10 secondes ou après une minute
• Sensibilité réglable
• Alerte si la batterie du téléphone de bébé faiblit ou s'il arrête d'écouter

LES NUITS
• Chaque nuit sur une frise : quand bébé a pleuré, combien de temps, et la plus longue période calme
• Vues semaine et mois avec tendances et nuits les plus calmes
• Un petit résumé le matin

PRIVÉ PAR NATURE
• Le son est analysé sur le téléphone, jamais enregistré ni envoyé
• Pas de compte, pas de suivi
• L'historique reste sur vos téléphones

Disponible en English, Ελληνικά, Deutsch, Français, Español, Português et 中文.

hush est une aide, pas un dispositif médical. Allez toujours voir votre bébé vous-même. Les niveaux sonores sont des estimations et varient selon les téléphones.""")

L["es-ES"] = ("hush: ruido blanco y monitor",
"Tus móviles se vuelven vigilabebés, con ruido blanco suave. Sin suscripción.",
"""¿No tienes máquina de ruido blanco ni vigilabebés? No te hace falta. hush convierte los móviles que ya tienes en ambas cosas: ruido blanco relajante y suave en la cuna, y un vigilabebés que te avisa cuando tu bebé llora. El ruido blanco es gratis. Prueba el vigilabebés 4 días gratis y luego desbloquéalo una vez. Sin suscripción.

RUIDO BLANCO, SIEMPRE SUAVE
• Seis sonidos: vientre, chist, marrón, rosa, blanco y mar
• Dile a hush a qué distancia está el móvil de la cuna y mantendrá el sonido por debajo de 50 dB allí, el límite recomendado para las salas de neonatos
• Mientras suena, el volumen del móvil no puede superar esa línea
• El modo inteligente empieza algo más alto, baja cuando el bebé se calma y vuelve a subir si empieza a llorar
• Temporizador con fundido suave
• Sigue sonando con la pantalla apagada

VIGILABEBÉS CON DOS MÓVILES
• Deja un móvil en la habitación del bebé: escucha el llanto en el propio móvil
• Escanea su código con tu móvil para vincularlos. Pueden vincularse varios padres
• Aviso cuando el bebé llora: al momento, a los 10 segundos o al minuto
• Sensibilidad ajustable
• Aviso si la batería del móvil del bebé baja o deja de escuchar

NOCHES
• Cada noche en una línea de tiempo: cuándo lloró, cuánto rato y el periodo tranquilo más largo
• Vistas semanales y mensuales con tendencias y las noches más tranquilas
• Un breve resumen por la mañana

PRIVADO DESDE EL PRINCIPIO
• El sonido se analiza en el móvil y nunca se graba ni se sube
• Sin cuenta y sin rastreo
• El historial se queda en tus móviles

Disponible en English, Ελληνικά, Deutsch, Français, Español, Português y 中文.

hush es una ayuda, no un dispositivo médico. Comprueba siempre tú mismo cómo está tu bebé. Los niveles de volumen son estimaciones y varían según el móvil.""")

L["pt-BR"] = ("hush: ruído branco e babá",
"Seus celulares viram babá eletrônica, com ruído branco suave. Sem assinatura.",
"""Sem aparelho de ruído branco nem babá eletrônica? Você não precisa. O hush transforma os celulares que você já tem nos dois: ruído branco relaxante e suave no berço, e uma babá eletrônica que avisa você quando o bebê chora. O ruído branco é grátis. Experimente a babá eletrônica grátis por 4 dias e depois libere com uma compra única. Sem assinatura.

RUÍDO BRANCO, SEMPRE SUAVE
• Seis sons: barriga, shhh, marrom, rosa, branco e mar
• Diga ao hush a que distância o celular está do berço e ele mantém o som abaixo de 50 dB ali, o limite recomendado para berçários hospitalares
• Enquanto toca, o volume do celular não passa desse limite
• O modo inteligente começa um pouco mais alto, abaixa quando o bebê se acalma e aumenta de novo se ele começar a chorar
• Timer com desligamento suave
• Continua tocando com a tela desligada

BABÁ ELETRÔNICA COM DOIS CELULARES
• Deixe um celular no quarto do bebê: ele escuta o choro no próprio aparelho
• Escaneie o código dele com o seu celular para conectar. Vários pais podem se conectar
• Alerta quando o bebê chora: na hora, depois de 10 segundos ou depois de um minuto
• Sensibilidade ajustável
• Alerta quando a bateria do celular do bebê está fraca ou ele para de escutar

NOITES
• Cada noite em uma linha do tempo: quando o bebê chorou, por quanto tempo e o maior período tranquilo
• Visões semanais e mensais com tendências e as noites mais calmas
• Um resumo rápido de manhã

PRIVADO DESDE O INÍCIO
• O som é analisado no celular e nunca é gravado nem enviado
• Sem conta e sem rastreamento
• O histórico fica nos seus celulares

Disponível em English, Ελληνικά, Deutsch, Français, Español, Português e 中文.

O hush é uma ajuda, não um aparelho médico. Sempre confira o bebê você mesmo. Os níveis de volume são estimativas e variam entre celulares.""")

L["zh-CN"] = ("hush：白噪音与宝宝监听",
"把手机变成宝宝监听器，还有柔和白噪音。无需订阅。",
"""没有白噪音机，也没有宝宝监视器？不需要。hush 把你现有的手机变成两者：在婴儿床边保持柔和音量的舒缓白噪音，以及宝宝哭时提醒你的监听器。白噪音免费。宝宝监听可免费试用 4 天，之后一次性解锁。无需订阅。

柔和的白噪音
• 六种声音：子宫、嘘声、棕噪音、粉噪音、白噪音和海浪
• 告诉 hush 手机离婴儿床多远，它会让床边的声音保持在 50 分贝以下，这是医院新生儿室推荐的上限
• 播放时，手机音量无法超过这条线
• 智能模式开始时稍大一些，宝宝安静后逐渐降低，开始哭时再调高
• 睡眠定时，结束时柔和淡出
• 关闭屏幕也能继续播放

两部手机即可监听
• 把一部手机放在宝宝房间，它直接在手机上识别哭声
• 用你的手机扫描它的二维码即可配对，可以配对多位家长
• 宝宝哭时提醒你：立即、哭 10 秒后或哭 1 分钟后
• 可调节灵敏度
• 宝宝手机电量低或停止监听时会提醒

夜晚记录
• 每晚的时间线：什么时候哭、哭了多久，以及最长的安静时段
• 每周和每月视图，显示趋势和最安稳的夜晚
• 早上收到一份简短总结

注重隐私
• 声音只在手机上分析，从不录音或上传
• 无需账号，无追踪
• 夜晚记录只保存在你的手机上

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
