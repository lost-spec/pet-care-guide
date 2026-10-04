/**
 * pet-data.js — shared static configuration for the care form.
 *
 * Holds the per-species life stages, the autocomplete lists, the
 * Breed/Species noun rule and a deliberately conservative baseline of
 * well-documented hazards. No logic here touches the network.
 */
(function (global) {
  'use strict';

  // Life stages differ meaningfully between species, so each gets its own list.
  var STAGES = {
    Dog: ['Puppy (under 1 year)', 'Young adult (1-3 years)', 'Adult (3-7 years)', 'Senior (7 years and up)'],
    Cat: ['Kitten (under 1 year)', 'Young adult (1-3 years)', 'Adult (3-10 years)', 'Senior (10 years and up)'],
    Rabbit: ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Hamster: ['Young (under 1 year)', 'Adult (1-2 years)', 'Senior (2 years and up)'],
    'Guinea Pig': ['Young (under 1 year)', 'Adult (1-4 years)', 'Senior (4 years and up)'],
    Bird: ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Fish: ['Fry or juvenile (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Reptile: ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'],
    Horse: ['Foal (under 2 years)', 'Young adult (2-4 years)', 'Mature adult (4-15 years)', 'Senior (15 years and up)']
  };

  // Species is the correct noun for animals not usually described by breed.
  var SPECIES_NOUN = ['Fish', 'Reptile', 'Bird'];

  var BREEDS = {
    Dog: ['Labrador Retriever', 'Golden Retriever', 'German Shepherd', 'French Bulldog', 'Poodle',
      'Beagle', 'Bulldog', 'Australian Shepherd', 'Border Collie', 'Corgi', 'Husky', 'Chihuahua'],
    Cat: ['Domestic Shorthair', 'Maine Coon', 'Siamese', 'Persian', 'Ragdoll', 'Bengal',
      'British Shorthair', 'Sphynx', 'Russian Blue', 'Abyssinian'],
    Rabbit: ['Holland Lop', 'Mini Rex', 'Mini Lop', 'Netherland Dwarf', 'Lionhead', 'Flemish Giant',
      'English Spot', 'Rex'],
    Hamster: ['Syrian Hamster', 'Winter White Dwarf', 'Roborovski', 'Chinese Hamster', 'European'],
    'Guinea Pig': ['American Guinea Pig', 'Abyssinian Guinea Pig', 'Peruvian', 'Wheaton',
      'English Smooth Coat'],
    Bird: ['Budgerigar', 'Cockatiel', 'African Grey Parrot', 'Budgie', 'Lovebird', 'Canary',
      'Macaw', 'Conure', 'Finch'],
    Fish: ['Betta', 'Goldfish', 'Guppy', 'Neon Tetra', 'Corydoras', 'Angelfish', 'Molly',
      'Platy', 'Koi'],
    Reptile: ['Bearded Dragon', 'Leopard Gecko', 'Crested Gecko', 'Corn Snake', 'Ball Python',
      'Bearded Dragon', 'Tortoise', 'Green Anole'],
    Horse: ['Quarter Horse', 'Thoroughbred', 'Morgan', 'Arabian', 'Appaloosa', 'Paint Horse',
      'Warmblood', 'Miniature Horse']
  };

  var MIXED = 'Mixed / Not sure';

  /**
   * Baseline hazards. These are long-established, widely published facts,
   * kept short and non-alarming. They are shown alongside anything the model
   * returns; the model is instructed not to invent hazards of its own.
   */
  var HAZARDS = {
    Dog: [
      { label: 'Chocolate', value: 'Toxic — keep baking chocolate, cake and cocoa out of reach.' },
      { label: 'Xylitol', value: 'Sugar-free gum, candy and peanut butter can cause a dangerous blood sugar drop.' },
      { label: 'Grapes & raisins', value: 'Can cause acute kidney injury. No safe snack-sized amount.' },
      { label: 'Onions & garlic', value: 'Toxic to dogs in powder, raw, cooked and concentrated forms.' },
      { label: 'Macadamias', value: 'Causes weakness, tremors and overheating.' }
    ],
    Cat: [
      { label: 'Lilies', value: 'Pollen and leaves from true lilies can cause sudden kidney failure.' },
      { label: 'Chocolate', value: 'Toxic, especially dark chocolate and baking chocolate.' },
      { label: 'Onions & garlic', value: 'Toxic to cats in powder, raw and cooked forms.' },
      { label: 'Alcohol & caffeine', value: 'Small amounts can be dangerous.' },
      { label: 'String & thread', value: 'Swallowed string can wind around the intestine and needs urgent care.' }
    ],
    Rabbit: [
      { label: 'Sudden diet change', value: 'The most common danger — introduce food changes over 2 weeks.' },
      { label: 'Sugary treats', value: 'Excess sugar and starch can cause fatal gut stasis.' },
      { label: 'Chocolate & onions', value: 'Toxic; keep sweets and kitchen scraps away.' },
      { label: 'Insufficient hay', value: 'Low fibre is the main preventable cause of dental and gut disease.' }
    ],
    Hamster: [
      { label: 'Sugary treats', value: 'Honey and sweet treats risk obesity and diabetes.' },
      { label: 'Chocolate & onions', value: 'Toxic — keep human snacks away.' },
      { label: 'Sudden diet change', value: 'Can cause fatal digestive upset; change food gradually.' },
      { label: 'Sharp bedding', value: 'Avoid cedar and pine shavings and anything with loose fibres.' }
    ],
    'Guinea Pig': [
      { label: 'Vitamin C need', value: 'Unlike other rodents they cannot make their own; deficiency causes scurvy.' },
      { label: 'Sudden diet change', value: 'Can be fatal — always transition over 7-10 days.' },
      { label: 'Sugary treats', value: 'Fruit and sugary treats should be small and occasional.' },
      { label: 'Onions & chocolate', value: 'Toxic; keep human food away.' }
    ],
    Bird: [
      { label: 'Avocado', value: 'Persin in the flesh and skin is toxic to birds.' },
      { label: 'Chocolate & caffeine', value: 'Toxic; coffee, tea and energy drinks are unsafe.' },
      { label: 'Onions & garlic', value: 'Toxic, including cooked forms.' },
      { label: 'Teflon fumes', value: 'Overheated non-stick cookware releases fumes that can kill a bird.' },
      { label: 'Aerosols & candles', value: 'Fumes and scented products are harmful to their airways.' }
    ],
    Fish: [
      { label: 'Chlorinated water', value: 'Treat tap water with a dechlorinator before adding it to a tank.' },
      { label: 'Overfeeding', value: 'Uneaten food fouls the water and raises ammonia fast.' },
      { label: 'Water temperature swings', value: 'Sudden changes stress fish and encourage disease.' },
      { label: 'Mismatched temperature', value: 'Keep coldwater and tropical species in separate tanks.' }
    ],
    Reptile: [
      { label: 'Heat lamp burns', value: 'Bulbs need a guard and a thermostat; check the hot spot daily.' },
      { label: 'Inadequate UVB', value: 'Without UVB most species develop metabolic bone disease.' },
      { label: 'Temperature swings', value: 'A proper day/night gradient is needed, not a constant heat.' },
      { label: 'Handling too soon', value: 'Reptiles often need to settle before regular handling.' }
    ],
    Horse: [
      { label: 'Toxic pasture plants', value: 'Poison hemlock, yew and acorns can be fatal. Inspect fields.' },
      { label: 'Moldy feed', value: 'Never feed moldy hay or grain.' },
      { label: 'Overfeeding concentrates', value: 'Too much hard feed causes colic and laminitis.' },
      { label: 'Sand or impaction', value: 'Feeding on sand and insufficient water raise colic risk.' }
    ]
  };

  var DEFAULT_STAGES = ['Young (under 1 year)', 'Adult (1-5 years)', 'Senior (5 years and up)'];
  var DEFAULT_BREEDS = [];

  function optionsFor(petType) {
    return (STAGES[petType] || DEFAULT_STAGES).slice();
  }

  function breedsFor(petType) {
    var list = (BREEDS[petType] || DEFAULT_BREEDS).slice();
    list.push(MIXED);
    return list;
  }

  function nounFor(petType) {
    return SPECIES_NOUN.indexOf(petType) > -1 ? 'Species' : 'Breed';
  }

  function placeholderFor(petType) {
    return nounFor(petType) === 'Species'
      ? 'e.g. Betta, Leopard gecko, Budgerigar'
      : 'e.g. Labrador Retriever, Maine Coon, Holland Lop';
  }

  function hazardsFor(petType) {
    return (HAZARDS[petType] || []).slice();
  }

  global.PetData = {
    MIXED: MIXED,
    stages: optionsFor,
    breeds: breedsFor,
    noun: nounFor,
    placeholder: placeholderFor,
    hazards: hazardsFor,
    STAGES: STAGES,
    BREEDS: BREEDS,
    HAZARDS: HAZARDS
  };
})(window);