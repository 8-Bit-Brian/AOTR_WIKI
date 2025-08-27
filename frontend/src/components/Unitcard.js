import './Unitcard.css'

function Unitcard({unit}) {
    const {NAME, COST, COMMAND_POINTS, BOUNTY_VAL, BUILD_TIME, HP, ARMORSET, WEAPONSET, HORDESPEED, SPECIAL, EXPERIENCE, VISION_RANGE, SHROUDCLEAR_RANGE} = unit;
    return(
      <div className="card">
        <img src="troop.png" alt="Avatar" />
        <div className="container">
          <h3><b>{NAME}</b></h3>
          <p><b>Cost:</b> {COST}</p>
          <p><b>Command Points:</b> {COMMAND_POINTS}</p>
          <p><b>Bounty Value:</b> {BOUNTY_VAL}</p>
          <p><b>Build Time:</b> {BUILD_TIME}</p>
          <p><b>Hit Points:</b> {HP}</p>
          <p><b>Armor Set:</b> {ARMORSET}</p>
          <p><b>Weapon Set:</b> {WEAPONSET}</p>
          <p><b>Horde Speed:</b> {HORDESPEED}</p>
          <p><b>Special:</b> {SPECIAL}</p>
          <p><b>Experience:</b> {EXPERIENCE}</p>
          <p><b>Vision Range:</b> {VISION_RANGE}</p>
          <p><b>Shroud Clear:</b> {SHROUDCLEAR_RANGE}</p>
        </div>
      </div> 
    );
};

export default Unitcard;