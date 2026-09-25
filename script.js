document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const ibanParam = urlParams.get('iban');
    const nameParam = urlParams.get('name');

    const generatorView = document.getElementById('generatorView');
    const displayView = document.getElementById('displayView');

    if (ibanParam && nameParam) {
        // Show Display View
        generatorView.classList.add('hidden');
        displayView.classList.remove('hidden');
        initDisplayView(ibanParam, nameParam);
    } else {
        // Show Generator View
        displayView.classList.add('hidden');
        generatorView.classList.remove('hidden');
        initGeneratorView();
    }
});

function initGeneratorView() {
    const form = document.getElementById('generateForm');
    const resultBox = document.getElementById('resultBox');
    const generatedLinkInput = document.getElementById('generatedLink');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const feedback = document.getElementById('linkCopyFeedback');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('nameInput').value.trim();
        const iban = document.getElementById('ibanInput').value.trim().replace(/\s+/g, ''); // Remove spaces

        // Generate URL
        const baseUrl = window.location.origin + window.location.pathname;
        const generatedUrl = `${baseUrl}?iban=${encodeURIComponent(iban)}&name=${encodeURIComponent(name)}`;
        
        generatedLinkInput.value = generatedUrl;
        resultBox.classList.remove('hidden');
    });

    copyLinkBtn.addEventListener('click', () => {
        generatedLinkInput.select();
        document.execCommand('copy');
        
        feedback.classList.add('show');
        setTimeout(() => {
            feedback.classList.remove('show');
        }, 2000);
    });
}

function initDisplayView(iban, name) {
    // 1. Set Name and Avatar
    document.getElementById('displayName').textContent = name;
    
    // Get Initials (e.g. Enes Furkan -> EF)
    const nameParts = name.split(' ').filter(n => n.length > 0);
    let initials = '';
    if (nameParts.length >= 2) {
        initials = nameParts[0][0] + nameParts[nameParts.length - 1][0];
    } else if (nameParts.length === 1) {
        initials = nameParts[0].substring(0, 2);
    } else {
        initials = 'XX';
    }
    document.getElementById('avatarText').textContent = initials.toUpperCase();

    // 2. Format and Set IBAN
    // Standardize IBAN format with spaces for readability (e.g., TR00 0000 0000 ...)
    const cleanIban = iban.replace(/\s+/g, '').toUpperCase();
    const formattedIban = cleanIban.match(/.{1,4}/g)?.join(' ') || cleanIban;
    
    document.getElementById('displayIban').textContent = formattedIban;

    // 3. Setup IBAN Copy
    const copyIbanBtn = document.getElementById('copyIbanBtn');
    const ibanFeedback = document.getElementById('ibanCopyFeedback');
    
    copyIbanBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cleanIban).then(() => {
            ibanFeedback.classList.add('show');
            setTimeout(() => {
                ibanFeedback.classList.remove('show');
            }, 2000);
        });
    });

    // 4. Setup Name Copy
    const copyNameBtn = document.getElementById('copyNameBtn');
    const nameFeedback = document.getElementById('nameCopyFeedback');
    
    copyNameBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(name).then(() => {
            nameFeedback.classList.add('show');
            setTimeout(() => {
                nameFeedback.classList.remove('show');
            }, 2000);
        });
    });

    // 5. Generate TR Karekod (EMV Format) and render QR
    const trKarekodPayload = generateTRKarekodEMV(cleanIban, name);
    
    const qrCanvas = document.getElementById('qrcode');
    
    new QRious({
        element: qrCanvas,
        value: trKarekodPayload,
        size: 200,
        level: 'L', // Low error correction to maximize data capacity
        foreground: '#0f172a',
        background: '#ffffff'
    });
}

/**
 * CRC16-CCITT for EMV QR Codes
 */
function calculateCRC(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    let hex = (crc & 0xFFFF).toString(16).toUpperCase();
    return hex.padStart(4, '0');
}

function padLength(str) {
    return str.length.toString().padStart(2, '0');
}

function buildTLV(tag, value) {
    return tag + padLength(value) + value;
}

/**
 * Generates an EMV MPM string mimicking TR Karekod for FAST transfers
 */
function generateTRKarekodEMV(iban, name) {
    let payload = "";
    const cleanIban = iban.replace(/\s+/g, '').toUpperCase();
    
    // TR Karekod P2P Format (Kişiden Kişiye Ödeme)
    payload += buildTLV("75", "10"); // Version 1.0
    payload += buildTLV("01", "11"); // Static QR
    
    // Tag 02 - Bank Code from IBAN
    let bankCode = cleanIban.substring(4, 9).replace(/^0+/, '');
    if (!bankCode) bankCode = "0000";
    payload += buildTLV("02", bankCode);
    
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    
    // Tag 03 - Reference (12 digits)
    payload += buildTLV("03", yy + mm + dd + "000001");
    
    // Tag 06 - Timestamp (12 digits: YYMMDDHHmmss)
    payload += buildTLV("06", yy + mm + dd + hh + min + ss);
    
    // Tag 54 - Amount (000000000000 = belirsiz tutar)
    payload += buildTLV("54", "000000000000");
    
    // Tag 61 - Hesap Bilgileri
    let tag61Content = "";
    tag61Content += buildTLV("01", cleanIban); // IBAN
    
    // İsim (Türkçe karakterler bu formatta genelde destekleniyor)
    let cleanName = name.trim().toUpperCase().substring(0, 30);
    tag61Content += buildTLV("07", cleanName);
    tag61Content += buildTLV("10", "03"); // Para birimi / Hesap Tipi
    
    payload += buildTLV("61", tag61Content);
    
    // Tag 20 - Banka İmza / Hash alanı (Opsiyonel olabilir, bankadan bankaya değişir)
    // Şimdilik 32 haneli rastgele/sıfır bir değer ekliyoruz ki format bütünlüğü bozulmasın.
    payload += buildTLV("20", "00000000000000000000000000000000");
    
    // Tag 63 - CRC
    payload += "6304";
    const crc = calculateCRC(payload);
    payload += crc;
    
    return payload;
}
