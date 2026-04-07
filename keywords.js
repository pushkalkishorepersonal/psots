// Keyword lists for moderation

const keywords = {
  // Buy/Sell content
  buySell: [
    'sell', 'buy', 'rent', 'price', '₹', 'rs.', 'contact for price',
    'call me', 'dm me', 'whatsapp me', 'available for sale',
    'second hand', 'looking to buy', 'for sale', 'selling',
    'buying', 'rental', 'lease'
  ],

  // Political content
  political: [
    'bjp', 'congress', 'aap', 'election', 'vote', 'modi',
    'cm', 'government policy', 'party', 'protest', 'rally',
    'political', 'minister', 'parliament', 'lok sabha'
  ],

  // Religious content (will be filtered out if not society event)
  religious: [
    'temple donation', 'mosque', 'church collection', 'prayer meeting',
    'temple', 'church', 'prayer', 'religious'
  ],

  // Approved religious/community events (DO NOT FLAG THESE)
  approvedEvents: [
    'chhath puja', 'diwali', 'holi', 'navratri', 'eid',
    'rakhi', 'ganesh chaturthi', 'durga puja', 'makar sankranti'
  ],

  // Spam/Unsolicited promotions
  spam: [
    'discount', 'offer', 'limited time', 'click here', 'refer a friend',
    'earn money', 'business opportunity', 'join us', 'sign up',
    'special offer', 'exclusive deal', 'hurry', 'act now'
  ],

  // Abusive words - Hindi
  abuseHindi: [
    'बेवकूफ', 'मूर्ख', 'गधा', 'चोर', 'झूठा', 'बदमाश',
    'भाड़', 'साला', 'हरामी', 'कमीना'
  ],

  // Abusive words - English
  abuseEnglish: [
    'idiot', 'stupid', 'fool', 'moron', 'dumb', 'jerk',
    'ass', 'bastard', 'jackass', 'imbecile'
  ],

  // Personal attack phrases
  personalAttacks: [
    'you are wrong', 'you are an', 'shut up', 'go away',
    'mind your own business', 'nobody asked you'
  ],

  // Society fees/maintenance (approved use of ₹)
  societyFees: [
    'cam', 'maintenance', 'maintenance charge', 'society fee',
    'maintenance fee', 'dues', 'payment', 'monthly charge'
  ]
};

module.exports = keywords;
