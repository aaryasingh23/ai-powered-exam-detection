// Question bank for the demo exams. `answer` is the index of the correct
// option and never leaves the server.

export interface BankQuestion {
  id: string;
  topic: string;
  text: string;
  options: string[];
  answer: number;
}

export interface ExamSeed {
  id: string;
  code: string;
  name: string;
  subject: string;
  durationMinutes: number;
  questions: BankQuestion[];
}

export const EXAM_SEEDS: ExamSeed[] = [
  {
    id: 'exam_cn',
    code: 'CN-2026',
    name: 'Computer Networks — Mid-Semester',
    subject: 'Computer Networks',
    durationMinutes: 30,
    questions: [
      {
        id: 'cn1',
        topic: 'OSI Model',
        text: 'Which layer of the OSI model is responsible for end-to-end delivery, segmentation and flow control?',
        options: ['Network layer', 'Transport layer', 'Data link layer', 'Session layer'],
        answer: 1,
      },
      {
        id: 'cn2',
        topic: 'TCP/IP',
        text: 'During the TCP three-way handshake, which sequence of segments is exchanged?',
        options: ['SYN → ACK → FIN', 'SYN → SYN-ACK → ACK', 'ACK → SYN → SYN-ACK', 'SYN → FIN → ACK'],
        answer: 1,
      },
      {
        id: 'cn3',
        topic: 'Addressing',
        text: 'How many usable host addresses are available in a /26 IPv4 subnet?',
        options: ['30', '62', '64', '126'],
        answer: 1,
      },
      {
        id: 'cn4',
        topic: 'Routing',
        text: 'Which routing protocol uses Dijkstra’s shortest-path algorithm to build its routing table?',
        options: ['RIP', 'BGP', 'OSPF', 'EIGRP'],
        answer: 2,
      },
      {
        id: 'cn5',
        topic: 'Application layer',
        text: 'Which protocol and default port are used by DNS for standard queries?',
        options: ['TCP 53 only', 'UDP 53', 'UDP 67', 'TCP 25'],
        answer: 1,
      },
      {
        id: 'cn6',
        topic: 'Data link layer',
        text: 'What is the primary purpose of the Address Resolution Protocol (ARP)?',
        options: [
          'Map a domain name to an IP address',
          'Map an IP address to a MAC address',
          'Assign IP addresses dynamically',
          'Encrypt traffic between two hosts',
        ],
        answer: 1,
      },
      {
        id: 'cn7',
        topic: 'Error control',
        text: 'Which technique can both detect and correct single-bit errors in a transmitted frame?',
        options: ['Parity bit', 'Checksum', 'Hamming code', 'CRC-32'],
        answer: 2,
      },
      {
        id: 'cn8',
        topic: 'Congestion control',
        text: 'In TCP Reno, what happens to the congestion window when three duplicate ACKs are received?',
        options: [
          'It is reset to 1 MSS',
          'It is halved (fast recovery)',
          'It is doubled',
          'It stays unchanged',
        ],
        answer: 1,
      },
      {
        id: 'cn9',
        topic: 'Security',
        text: 'Which protocol provides encryption for HTTP traffic on the web?',
        options: ['SSH', 'TLS', 'IPsec AH', 'SNMP'],
        answer: 1,
      },
      {
        id: 'cn10',
        topic: 'Network devices',
        text: 'Which device separates collision domains but keeps all ports in one broadcast domain by default?',
        options: ['Hub', 'Repeater', 'Switch', 'Router'],
        answer: 2,
      },
    ],
  },
  {
    id: 'exam_phy',
    code: 'PHY-2026',
    name: 'Engineering Physics — Unit Test',
    subject: 'Physics',
    durationMinutes: 30,
    questions: [
      {
        id: 'ph1',
        topic: 'Mechanics',
        text: 'A body moving in a circle at constant speed has which of the following?',
        options: ['Zero acceleration', 'Acceleration towards the centre', 'Tangential acceleration only', 'Increasing kinetic energy'],
        answer: 1,
      },
      {
        id: 'ph2',
        topic: 'Optics',
        text: 'The phenomenon responsible for the colours seen in a thin soap film is:',
        options: ['Diffraction', 'Polarisation', 'Interference', 'Dispersion'],
        answer: 2,
      },
      {
        id: 'ph3',
        topic: 'Quantum',
        text: 'The photoelectric effect demonstrates that light behaves as:',
        options: ['A longitudinal wave', 'A stream of particles (photons)', 'A transverse wave only', 'A magnetic field'],
        answer: 1,
      },
      {
        id: 'ph4',
        topic: 'Semiconductors',
        text: 'Doping silicon with phosphorus produces which type of semiconductor?',
        options: ['p-type', 'n-type', 'Intrinsic', 'Insulator'],
        answer: 1,
      },
      {
        id: 'ph5',
        topic: 'Electromagnetism',
        text: 'Which law states that the induced EMF opposes the change in magnetic flux?',
        options: ['Ampère’s law', 'Gauss’s law', 'Lenz’s law', 'Coulomb’s law'],
        answer: 2,
      },
      {
        id: 'ph6',
        topic: 'Thermodynamics',
        text: 'In an adiabatic process, which quantity is exchanged with the surroundings?',
        options: ['Heat only', 'Work only', 'Both heat and work', 'Neither'],
        answer: 1,
      },
    ],
  },
  {
    id: 'exam_math',
    code: 'MATH-2026',
    name: 'Engineering Mathematics — Unit Test',
    subject: 'Mathematics',
    durationMinutes: 30,
    questions: [
      {
        id: 'm1',
        topic: 'Calculus',
        text: 'What is the derivative of sin(x) · cos(x)?',
        options: ['cos(2x)', 'sin(2x)', '−sin(2x)', '2 sin(x)'],
        answer: 0,
      },
      {
        id: 'm2',
        topic: 'Linear algebra',
        text: 'If a 3×3 matrix has determinant 0, the matrix is:',
        options: ['Orthogonal', 'Singular', 'Symmetric', 'Identity'],
        answer: 1,
      },
      {
        id: 'm3',
        topic: 'Probability',
        text: 'Two fair dice are rolled. What is the probability that the sum is 7?',
        options: ['1/12', '1/6', '1/36', '7/36'],
        answer: 1,
      },
      {
        id: 'm4',
        topic: 'Series',
        text: 'The sum of the infinite geometric series 1 + 1/2 + 1/4 + … equals:',
        options: ['1.5', '2', '∞', '4'],
        answer: 1,
      },
      {
        id: 'm5',
        topic: 'Differential equations',
        text: 'The general solution of dy/dx = y is:',
        options: ['y = x + C', 'y = Ce^x', 'y = Cx', 'y = ln(x) + C'],
        answer: 1,
      },
      {
        id: 'm6',
        topic: 'Complex numbers',
        text: 'What is the value of i⁴?',
        options: ['−1', '1', 'i', '−i'],
        answer: 1,
      },
    ],
  },
  {
    id: 'exam_dsa',
    code: 'DSA-2026',
    name: 'Data Structures & Algorithms — Quiz',
    subject: 'Computer Science',
    durationMinutes: 30,
    questions: [
      {
        id: 'd1',
        topic: 'Complexity',
        text: 'What is the average-case time complexity of searching in a balanced binary search tree?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        answer: 1,
      },
      {
        id: 'd2',
        topic: 'Sorting',
        text: 'Which sorting algorithm is stable and runs in O(n log n) in the worst case?',
        options: ['Quick sort', 'Heap sort', 'Merge sort', 'Selection sort'],
        answer: 2,
      },
      {
        id: 'd3',
        topic: 'Stacks',
        text: 'Which data structure is used to evaluate a postfix expression?',
        options: ['Queue', 'Stack', 'Heap', 'Graph'],
        answer: 1,
      },
      {
        id: 'd4',
        topic: 'Graphs',
        text: 'Breadth-first search on an unweighted graph finds:',
        options: ['A minimum spanning tree', 'Shortest paths by edge count', 'Strongly connected components', 'A topological order'],
        answer: 1,
      },
      {
        id: 'd5',
        topic: 'Hashing',
        text: 'Open addressing with linear probing primarily suffers from:',
        options: ['Primary clustering', 'Stack overflow', 'Memory leaks', 'Starvation'],
        answer: 0,
      },
      {
        id: 'd6',
        topic: 'Dynamic programming',
        text: 'The 0/1 knapsack problem is typically solved optimally using:',
        options: ['Greedy choice', 'Dynamic programming', 'Binary search', 'Backtracking only'],
        answer: 1,
      },
    ],
  },
];
