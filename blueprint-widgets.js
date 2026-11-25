(function () {
  var blueprintRecord = { Entity: null, RecordID: null };

  function normalizeStateName(name) {
    return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function workflowOrder() {
    return (
      (window.BLUEPRINT_WORKFLOW_ORDER &&
        window.BLUEPRINT_WORKFLOW_ORDER.slice()) ||
      []
    );
  }

  function resolveWorkflowIndex(currentStateName) {
    var order = workflowOrder();
    var normalizedCurrent = normalizeStateName(currentStateName);
    for (var i = 0; i < order.length; i++) {
      if (normalizeStateName(order[i]) === normalizedCurrent) {
        return i;
      }
    }
    return -1;
  }

  function getPreviousStateName(currentStateName) {
    var index = resolveWorkflowIndex(currentStateName);
    if (index <= 0) {
      return null;
    }
    return workflowOrder()[index - 1];
  }

  function collectTransitions(blueprintResponse) {
    var collected = [];
    var transitions =
      (blueprintResponse &&
        blueprintResponse.blueprint &&
        blueprintResponse.blueprint.transitions) ||
      [];

    transitions.forEach(function (transition) {
      collected.push(transition);
      (transition.next_transitions || []).forEach(function (child) {
        collected.push(child);
      });
    });

    return collected;
  }

  function findTransitionToState(blueprintResponse, targetStateName) {
    var target = normalizeStateName(targetStateName);
    var transitions = collectTransitions(blueprintResponse);
    var matchByDestination = null;
    var matchByPreviousStateName = null;

    for (var i = 0; i < transitions.length; i++) {
      var transition = transitions[i];
      if (!transition || !transition.id) {
        continue;
      }

      if (normalizeStateName(transition.next_field_value) === target) {
        matchByDestination = transition;
        break;
      }

      if (
        normalizeStateName(transition.name) === "previous state" &&
        !matchByPreviousStateName
      ) {
        matchByPreviousStateName = transition;
      }
    }

    return matchByDestination || matchByPreviousStateName;
  }

  function runBlueprintTransition(transitionId) {
    return ZOHO.CRM.API.updateBluePrint({
      Entity: blueprintRecord.Entity,
      RecordID: blueprintRecord.RecordID,
      BlueprintData: {
        blueprint: [
          {
            transition_id: transitionId,
            data: {},
          },
        ],
      },
    });
  }

  ZOHO.embeddedApp.on("PageLoad", function (data) {
    blueprintRecord.Entity = data.Entity;
    blueprintRecord.RecordID = data.EntityId;
  });

  window.previousBlueprintState = function previousBlueprintState() {
    if (!blueprintRecord.Entity || !blueprintRecord.RecordID) {
      alert(
        "This page is not linked to a CRM record yet. Open it from a Blueprint transition."
      );
      return;
    }

    if (!workflowOrder().length) {
      alert(
        "workflow-order.js is missing or empty. Add your Blueprint stage names in order."
      );
      return;
    }

    ZOHO.CRM.API.getBluePrint({
      Entity: blueprintRecord.Entity,
      RecordID: blueprintRecord.RecordID,
    })
      .then(function (blueprintResponse) {
        var processInfo =
          blueprintResponse &&
          blueprintResponse.blueprint &&
          blueprintResponse.blueprint.process_info;
        var currentState =
          (processInfo && processInfo.field_value) || "";

        if (!currentState) {
          alert("Could not read the current Blueprint stage for this record.");
          return null;
        }

        var previousState = getPreviousStateName(currentState);
        if (!previousState) {
          if (resolveWorkflowIndex(currentState) === -1) {
            alert(
              'Current stage "' +
                currentState +
                '" is not listed in workflow-order.js. Add it in the right position, using the exact Zoho stage name.'
            );
          } else {
            alert("This record is already on the first stage in workflow-order.js.");
          }
          return null;
        }

        var transition = findTransitionToState(
          blueprintResponse,
          previousState
        );
        if (!transition) {
          var destinations = collectTransitions(blueprintResponse)
            .map(function (t) {
              return t.next_field_value || t.name;
            })
            .filter(Boolean)
            .join(", ");

          alert(
            'No transition to "' +
              previousState +
              '" is available from "' +
              currentState +
              '".\n\nIn Zoho Blueprint, add a back transition on this stage whose destination is "' +
              previousState +
              '".\n\nTransitions available now: ' +
              (destinations || "none")
          );
          return null;
        }

        return runBlueprintTransition(transition.id);
      })
      .then(function (response) {
        if (!response) {
          return;
        }
        console.log("Moved one Blueprint stage back", response);
      })
      .catch(function (error) {
        console.error("Previous state transition failed", error);
        alert(
          "Could not move one stage back. Check the back transition in Blueprint and any required fields."
        );
      });
  };
})();