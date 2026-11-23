import React, { createContext, useEffect, useState, useMemo } from 'react';
import Unitcard from './components/Unitcard';
import Dropdown from './components/Dropdown';
import armorData from './data/armors.json';
import './assets/fonts/fonts.css';
import './App.css';



// create context
export const ArmorContext = createContext();


function App() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState([]);
  const [selectedFaction, setSelectedFaction] = useState("");

  // Create a dictionary that's memoized for all the armors in the game
  const armorDict = useMemo(() => {
    const dict = {};
    armorData.forEach(a => {
      dict[a.name] = a;
    });
    return dict;
  }, []);

  // Call backend when component loads
  useEffect(() => {
    const fetch_all_units = async () => {
      const data = await fetch("http://127.0.0.1:5000/allunits");
      const stats = await data.json();
      console.log(stats);
      setResult(stats);
    };
    fetch_all_units();
  }, []);

  async function SearchForUnit(event) {
    setQuery(event.target.value);

    const data = await fetch(`http://127.0.0.1:5000/unit-search?unit_name=${encodeURIComponent(event.target.value)}`);
    const stats = await data.json();
    console.log(stats);
    setResult(stats);
  };

  const filteredUnits = selectedFaction
    ? result.filter((unit) => String(unit.FACTION_ID) === selectedFaction)
    : result;

  return (
    <div>
      <div>
        <h1 className="title" >Welcome to the Age of the Ring Unit Wiki</h1>
      </div>
      <div>
        <input type="text" id="uname" name="unit-name" value={query} onChange={SearchForUnit}/><br />
      </div>
      <div>
        <Dropdown
          value={selectedFaction}
          onChange={(event) => setSelectedFaction(event.target.value)}
        />
      </div>


      <ArmorContext.Provider value={armorDict}>
        <ul className="card-container">
          {filteredUnits.map(troop => (
            <Unitcard key={troop.UNIT_ID} unit={troop} />
            ))}
        </ul>
      </ArmorContext.Provider>
    </div>
  );
}

export default App;
