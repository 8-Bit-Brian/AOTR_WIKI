const factions = [
  { id: 1, name: 'Gondor' },
  { id: 2, name: 'Rohan' },
  { id: 3, name: 'Erebor' },
  { id: 4, name: 'Rivendell' },
  { id: 5, name: 'Lothlorien' },
  { id: 6, name: 'Woodland Realm' },
  { id: 7, name: 'Isengard' },
  { id: 8, name: 'Mordor' },
  { id: 9, name: 'Misty Mountains' },
  { id: 10, name: 'Dol Guldur' },
  { id: 11, name: 'Haradwaith' },
];

function Dropdown({ value, onChange }) {
  return (
    <select
      id="faction"
      name="faction"
      value={value}
      onChange={onChange}
      aria-label="Filter units by faction"
    >
      <option value="">All factions</option>
      {factions.map((faction) => (
        <option key={faction.id} value={faction.id}>
          {faction.name}
        </option>
      ))}
    </select>
  );
}

export default Dropdown;
