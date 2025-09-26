import { Tooltip } from 'react-tooltip';
import { useContext } from 'react';
import { ArmorContext } from '../App'; 

function Armortooltip({ armor }) {
    const armorDict = useContext(ArmorContext);
    const armorNames = armor ? armor.split("/") : [];
    const tooltipId = `armor-tooltip-${armor}`;
    const tooltipInfo = (
      <div style={{ whiteSpace: "pre-line" }}>
        {armorNames.map(name => {
          const data = armorDict[name];
          if (!data) {
            return (
              <div key={name}>
                <i>No data for {name}</i>
              </div>
            );
          }

          return (
            <div key={name} style={{ marginBottom: "10px" }}>
              <h4>{name}</h4>
              {Object.entries(data)
                .filter(([key]) => key !== "name")
                .map(([key, value]) => (
                  <div key={key}>
                    <b>{key}</b>: {value}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    );
    
  return (
    <div data-tooltip-id={tooltipId}>
      <p>
        <b>Armor Set:</b> {armor}
      </p>
      <Tooltip id={tooltipId} className="example-padding">
        {tooltipInfo}
      </Tooltip>
    </div>
  );
}   

export default Armortooltip;
