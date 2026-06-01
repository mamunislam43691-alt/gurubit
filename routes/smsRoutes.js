/**
 * SMS Routes
 */

const express = require('express');
const router = express.Router();
const { processIncomingSMS } = require('../utils/smsProcessor');
const { collections } = require('../config/firebase');

// Country code → name/server mapping (extended)
const COUNTRY_MAP = {
  '1':   { country: 'United States', server: 'US-East-1' },
  '44':  { country: 'United Kingdom', server: 'UK-London' },
  '49':  { country: 'Germany', server: 'EU-Frankfurt' },
  '91':  { country: 'India', server: 'IN-Mumbai' },
  '33':  { country: 'France', server: 'EU-Paris' },
  '81':  { country: 'Japan', server: 'AP-Tokyo' },
  '61':  { country: 'Australia', server: 'AU-Sydney' },
  '7':   { country: 'Russia', server: 'RU-Moscow' },
  '55':  { country: 'Brazil', server: 'SA-Sao Paulo' },
  '52':  { country: 'Mexico', server: 'NA-Mexico' },
  '62':  { country: 'Indonesia', server: 'AP-Jakarta' },
  '63':  { country: 'Philippines', server: 'AP-Manila' },
  '66':  { country: 'Thailand', server: 'AP-Bangkok' },
  '84':  { country: 'Vietnam', server: 'AP-Hanoi' },
  '880': { country: 'Bangladesh', server: 'AS-Dhaka' },
  '92':  { country: 'Pakistan', server: 'AS-Karachi' },
  '93':  { country: 'Afghanistan', server: 'AS-Kabul' },
  '251': { country: 'Ethiopia', server: 'AF-Addis' },
  '234': { country: 'Nigeria', server: 'AF-Lagos' },
  '254': { country: 'Kenya', server: 'AF-Nairobi' },
  '20':  { country: 'Egypt', server: 'AF-Cairo' },
  '27':  { country: 'South Africa', server: 'AF-Joburg' },
  '90':  { country: 'Turkey', server: 'EU-Istanbul' },
  '98':  { country: 'Iran', server: 'AS-Tehran' },
  '966': { country: 'Saudi Arabia', server: 'ME-Riyadh' },
  '971': { country: 'UAE', server: 'ME-Dubai' },
  '972': { country: 'Israel', server: 'ME-Tel Aviv' },
  '380': { country: 'Ukraine', server: 'EU-Kyiv' },
  '48':  { country: 'Poland', server: 'EU-Warsaw' },
  '34':  { country: 'Spain', server: 'EU-Madrid' },
  '39':  { country: 'Italy', server: 'EU-Rome' },
  '31':  { country: 'Netherlands', server: 'EU-Amsterdam' },
  '46':  { country: 'Sweden', server: 'EU-Stockholm' },
  '47':  { country: 'Norway', server: 'EU-Oslo' },
  '45':  { country: 'Denmark', server: 'EU-Copenhagen' },
  '358': { country: 'Finland', server: 'EU-Helsinki' },
  '41':  { country: 'Switzerland', server: 'EU-Zurich' },
  '43':  { country: 'Austria', server: 'EU-Vienna' },
  '32':  { country: 'Belgium', server: 'EU-Brussels' },
  '351': { country: 'Portugal', server: 'EU-Lisbon' },
  '30':  { country: 'Greece', server: 'EU-Athens' },
  '40':  { country: 'Romania', server: 'EU-Bucharest' },
  '36':  { country: 'Hungary', server: 'EU-Budapest' },
  '420': { country: 'Czech Republic', server: 'EU-Prague' },
  '421': { country: 'Slovakia', server: 'EU-Bratislava' },
  '385': { country: 'Croatia', server: 'EU-Zagreb' },
  '386': { country: 'Slovenia', server: 'EU-Ljubljana' },
  '359': { country: 'Bulgaria', server: 'EU-Sofia' },
  '370': { country: 'Lithuania', server: 'EU-Vilnius' },
  '371': { country: 'Latvia', server: 'EU-Riga' },
  '372': { country: 'Estonia', server: 'EU-Tallinn' },
  '375': { country: 'Belarus', server: 'EU-Minsk' },
  '373': { country: 'Moldova', server: 'EU-Chisinau' },
  '994': { country: 'Azerbaijan', server: 'AS-Baku' },
  '995': { country: 'Georgia', server: 'AS-Tbilisi' },
  '374': { country: 'Armenia', server: 'AS-Yerevan' },
  '996': { country: 'Kyrgyzstan', server: 'AS-Bishkek' },
  '998': { country: 'Uzbekistan', server: 'AS-Tashkent' },
  '992': { country: 'Tajikistan', server: 'AS-Dushanbe' },
  '993': { country: 'Turkmenistan', server: 'AS-Ashgabat' },
  '7':   { country: 'Kazakhstan', server: 'AS-Almaty' },
  '86':  { country: 'China', server: 'AP-Beijing' },
  '82':  { country: 'South Korea', server: 'AP-Seoul' },
  '886': { country: 'Taiwan', server: 'AP-Taipei' },
  '852': { country: 'Hong Kong', server: 'AP-HK' },
  '853': { country: 'Macau', server: 'AP-Macau' },
  '65':  { country: 'Singapore', server: 'AP-Singapore' },
  '60':  { country: 'Malaysia', server: 'AP-KL' },
  '64':  { country: 'New Zealand', server: 'AP-Auckland' },
  '94':  { country: 'Sri Lanka', server: 'AS-Colombo' },
  '977': { country: 'Nepal', server: 'AS-Kathmandu' },
  '95':  { country: 'Myanmar', server: 'AP-Yangon' },
  '855': { country: 'Cambodia', server: 'AP-Phnom Penh' },
  '856': { country: 'Laos', server: 'AP-Vientiane' },
  '673': { country: 'Brunei', server: 'AP-BSB' },
  '976': { country: 'Mongolia', server: 'AP-Ulaanbaatar' },
  '850': { country: 'North Korea', server: 'AP-Pyongyang' },
  '961': { country: 'Lebanon', server: 'ME-Beirut' },
  '962': { country: 'Jordan', server: 'ME-Amman' },
  '963': { country: 'Syria', server: 'ME-Damascus' },
  '964': { country: 'Iraq', server: 'ME-Baghdad' },
  '965': { country: 'Kuwait', server: 'ME-Kuwait' },
  '968': { country: 'Oman', server: 'ME-Muscat' },
  '974': { country: 'Qatar', server: 'ME-Doha' },
  '973': { country: 'Bahrain', server: 'ME-Manama' },
  '967': { country: 'Yemen', server: 'ME-Sanaa' },
  '970': { country: 'Palestine', server: 'ME-Ramallah' },
  '212': { country: 'Morocco', server: 'AF-Casablanca' },
  '213': { country: 'Algeria', server: 'AF-Algiers' },
  '216': { country: 'Tunisia', server: 'AF-Tunis' },
  '218': { country: 'Libya', server: 'AF-Tripoli' },
  '249': { country: 'Sudan', server: 'AF-Khartoum' },
  '233': { country: 'Ghana', server: 'AF-Accra' },
  '225': { country: 'Ivory Coast', server: 'AF-Abidjan' },
  '221': { country: 'Senegal', server: 'AF-Dakar' },
  '237': { country: 'Cameroon', server: 'AF-Yaounde' },
  '243': { country: 'DR Congo', server: 'AF-Kinshasa' },
  '255': { country: 'Tanzania', server: 'AF-Dar es Salaam' },
  '256': { country: 'Uganda', server: 'AF-Kampala' },
  '250': { country: 'Rwanda', server: 'AF-Kigali' },
  '258': { country: 'Mozambique', server: 'AF-Maputo' },
  '260': { country: 'Zambia', server: 'AF-Lusaka' },
  '263': { country: 'Zimbabwe', server: 'AF-Harare' },
  '267': { country: 'Botswana', server: 'AF-Gaborone' },
  '264': { country: 'Namibia', server: 'AF-Windhoek' },
  '266': { country: 'Lesotho', server: 'AF-Maseru' },
  '268': { country: 'Eswatini', server: 'AF-Mbabane' },
  '261': { country: 'Madagascar', server: 'AF-Antananarivo' },
  '230': { country: 'Mauritius', server: 'AF-Port Louis' },
  '248': { country: 'Seychelles', server: 'AF-Victoria' },
  '269': { country: 'Comoros', server: 'AF-Moroni' },
  '252': { country: 'Somalia', server: 'AF-Mogadishu' },
  '253': { country: 'Djibouti', server: 'AF-Djibouti' },
  '291': { country: 'Eritrea', server: 'AF-Asmara' },
  '57':  { country: 'Colombia', server: 'SA-Bogota' },
  '51':  { country: 'Peru', server: 'SA-Lima' },
  '56':  { country: 'Chile', server: 'SA-Santiago' },
  '54':  { country: 'Argentina', server: 'SA-Buenos Aires' },
  '58':  { country: 'Venezuela', server: 'SA-Caracas' },
  '593': { country: 'Ecuador', server: 'SA-Quito' },
  '591': { country: 'Bolivia', server: 'SA-La Paz' },
  '595': { country: 'Paraguay', server: 'SA-Asuncion' },
  '598': { country: 'Uruguay', server: 'SA-Montevideo' },
  '53':  { country: 'Cuba', server: 'CA-Havana' },
  '1809':{ country: 'Dominican Republic', server: 'CA-Santo Domingo' },
  '502': { country: 'Guatemala', server: 'CA-Guatemala City' },
  '503': { country: 'El Salvador', server: 'CA-San Salvador' },
  '504': { country: 'Honduras', server: 'CA-Tegucigalpa' },
  '505': { country: 'Nicaragua', server: 'CA-Managua' },
  '506': { country: 'Costa Rica', server: 'CA-San Jose' },
  '507': { country: 'Panama', server: 'CA-Panama City' },
};

function getCountryFromPhone(phone) {
  if (!phone) return { country: 'Global', server: 'Global-1' };
  const digits = String(phone).replace(/\D/g, '');
  // Try longest prefix first (up to 4 digits)
  for (let len = 4; len >= 1; len--) {
    const prefix = digits.slice(0, len);
    if (COUNTRY_MAP[prefix]) return COUNTRY_MAP[prefix];
  }
  return { country: 'Global', server: 'Global-1' };
}

function maskPhone(phone) {
  if (!phone) return '+•• ••• ••••';
  const s = String(phone).replace(/\s/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  
  // For admin SMS feed, show full number (no masking)
  // Format: +XXX XXX XXXXXX
  const formatted = digits.startsWith('+') ? digits : `+${digits}`;
  return formatted;
}

function normalizeFeedRow(d, id) {
  const meta = getCountryFromPhone(d.phoneNumber);
  const service = d.platformName || d.service || 'Verification';
  const otp = d.otp || d.otpCode || d.code || null;
  const message = d.content || d.message || d.smsMessage || '';
  return {
    id: id || d.id,
    phoneNumber: maskPhone(d.phoneNumber),
    country: d.country || d.countryName || meta.country,
    server: d.server || d.serverName || meta.server,
    service,
    otpCode: otp,
    message,
    createdAt: d.receivedAt || d.createdAt || new Date().toISOString()
  };
}

router.get('/live-feed', async (req, res) => {
  // Feed starts empty — only real-time WebSocket messages populate it
  res.json({ success: true, messages: [] });
});

router.post('/receive', async (req, res) => {
  try {
    const { phoneNumber, content } = req.body;
    if (!phoneNumber || !content) {
      return res.status(400).json({ success: false, error: { message: 'PhoneNumber and content are required' } });
    }
    const wss = req.app.get('wss');
    const messageData = await processIncomingSMS({ phoneNumber, content }, wss);
    if (!messageData) {
      return res.status(404).json({ success: false, error: { message: 'No active session found for this number' } });
    }
    res.json({ success: true, message: 'SMS processed successfully', data: messageData });
  } catch (error) {
    console.error('SMS receive error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
});

module.exports = router;
module.exports.normalizeFeedRow = normalizeFeedRow;
module.exports.getCountryFromPhone = getCountryFromPhone;
module.exports.maskPhone = maskPhone;
