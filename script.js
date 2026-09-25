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

    // 4. Generate TR Karekod (EMV Format) and render QR
    const trKarekodPayload = generateTRKarekodEMV(cleanIban, name);
    
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; // clear if any
    
    new QRCode(qrContainer, {
        text: trKarekodPayload,
        width: 200,
        height: 200,
        colorDark : "#0f172a",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
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
    
    payload += buildTLV("00", "01"); // Version
    payload += buildTLV("01", "11"); // Static
    
    // Tag 26 - TR Karekod FAST Structure
    // "00" GUID: TR.GOV.TCMB.FAST
    // "01" IBAN
    const trKarekodSub = buildTLV("00", "TR.GOV.TCMB.FAST") + buildTLV("01", iban);
    payload += buildTLV("26", trKarekodSub);
    
    payload += buildTLV("52", "0000"); // Merchant Category Code (0000 for P2P)
    payload += buildTLV("53", "949"); // Currency TRY
    
    // Normalize name to ASCII/English characters max 25 len (EMV requirement)
    const normalizedName = name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^A-Za-z0-9 ]/g, "")
        .substring(0, 25)
        .trim() || "MUSTERI";
        
    payload += buildTLV("58", "TR"); // Country
    payload += buildTLV("59", normalizedName); // Name
    payload += buildTLV("60", "ISTANBUL"); // City (required by some banks)
    
    // CRC Preparation
    payload += "6304";
    const crc = calculateCRC(payload);
    payload += crc;
    
    return payload;
}
