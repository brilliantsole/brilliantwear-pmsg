import * as BW from "./brilliantwear/brilliantwear.module.min.js";

window.BW = BW;

// DEVICE HELPERS

/** @param {BW.Device} device */
const isDevicePMSG = (device) => device.deviceInformation.modelNumber == "PMSG";
const getPMSGDevice = () =>
  BW.DeviceManager.connectedDevices.find((device) => isDevicePMSG(device));

/** @param {(device: BW.Device) => void} callback */
const onPMSGDeviceConnected = (callback) => {
  BW.DeviceManager.addEventListener("deviceConnected", (event) => {
    const { device } = event.message;
    if (isDevicePMSG(device)) {
      callback(device);
    }
  });
};
/** @param {(device: BW.Device) => void} callback */
const onPMSGDeviceNotConnected = (callback) => {
  BW.DeviceManager.addEventListener("deviceNotConnected", (event) => {
    const { device } = event.message;
    if (isDevicePMSG(device) && !getPMSGDevice()) {
      callback(device);
    }
  });
};
/** @param {(device: BW.Device, isConnected: boolean) => void} callback */
const onPMSGDeviceIsConnected = (callback) => {
  onPMSGDeviceConnected((device) => callback(device, true));
  onPMSGDeviceNotConnected((device) => callback(device, false));
};

// CONNECTION

/** @type {HTMLButtonElement} */
const addDeviceButton = document.getElementById("addDevice");
addDeviceButton.disabled = !(await BW.Device.CanConnect);
addDeviceButton.addEventListener("click", async () => {
  let device = getPMSGDevice();
  if (device) {
    addDeviceButton.disabled = true;
    addDeviceButton.innerText = "disconnecting";
    await device.disconnect();
    return;
  }

  addDeviceButton.disabled = true;
  addDeviceButton.innerText = "adding device...";
  device = await BW.Device.Connect();
  if (device) {
    if (!isDevicePMSG(device)) {
      window.alert("device isn't PMSG - disconnecting now");
      await device.disconnect();
    }
  } else {
    addDeviceButton.innerText = "add device";
  }
  addDeviceButton.disabled = false;
});

onPMSGDeviceIsConnected((device, isConnected) => {
  const hasDevice = Boolean(getPMSGDevice());
  addDeviceButton.innerText = hasDevice ? "disconnect" : "add device";
  addDeviceButton.disabled = false;
});

// A-FRAME
const scene = document.querySelector("a-scene");
const targetEntity = scene.querySelector(".target");
const targetPositionEntity = targetEntity.querySelector(".position");
const targetRotationEntity = targetEntity.querySelector(".rotation");
const modelEntity = targetEntity.querySelector("[gltf-model]");

const ledEntities = [];
const ledEntityLights = [];
const ledMeshes = [];
const ledMaterials = [];
modelEntity.addEventListener("model-loaded", () => {
  const model = modelEntity.getObject3D("mesh");
  if (!model) return;

  model.traverse((_model) => {
    if (_model.name.startsWith("LED_")) {
      ledMeshes.push(_model);
    }
  });
  ledMeshes.sort((a, b) => +a.name.split("_")[1] - +b.name.split("_")[1]);
  // console.log("ledMeshes", ledMeshes);

  ledMeshes.forEach((ledMesh, index) => {
    ledMaterials[index] = new THREE.MeshBasicMaterial({
      color: 0x000000,
    });
    ledMesh.material = ledMaterials[index];

    const ledEntity = document.createElement("a-light");
    const ledPosition = new THREE.Vector3(-0.002, 0, 0);
    ledPosition.add(ledMesh.position);
    ledEntity.setAttribute("position", ledPosition.toArray().join(" "));
    ledEntity.setAttribute("type", "point");
    ledEntity.setAttribute("color", "black");
    ledEntity.setAttribute("decay", "1");
    ledEntity.setAttribute("intensity", "0.1");
    ledEntity.setAttribute("distance", "0.1");
    ledEntity.addEventListener("loaded", () => {
      ledEntityLights[index] = ledEntity.getObject3D("light");
    });
    modelEntity.appendChild(ledEntity);
  });
});

/**
 * @param {number} index
 * @param {string|number} color
 */
const updateLed = (index, color) => {
  // console.log("updateLed", { index, color });
  if (!ledMaterials[index]) {
    console.error(`invalid ledMaterials index ${index}`);
    return;
  }
  ledMaterials[index].color.set(color);
  ledEntityLights[index].color.set(color);
};

/**
 * @param {BW.Vector3?} acceleration
 * @param {number?} timestamp
 */
const updateTargetPositionEntityPosition = (acceleration, timestamp) => {
  const { x, y, z } = acceleration ?? { x: 0, y: 0, z: 0 };
  targetPositionEntity.object3D.position.set(x, y, z).multiplyScalar(0.05);
};
/**
 * @param {BW.Euler?} orientation
 * @param {number?} timestamp
 */
const updateTargetRotationEntityEuler = (orientation, timestamp) => {
  const { pitch, heading, roll } = orientation ?? {
    pitch: 0,
    heading: 0,
    roll: 0,
  };
  targetPositionEntity.object3D.rotation.set(
    THREE.MathUtils.degToRad(pitch),
    THREE.MathUtils.degToRad(heading),
    THREE.MathUtils.degToRad(roll),
    "YXZ",
  );
};
/**
 * @param {BW.Quaternion} quaternion
 * @param {number?} timestamp
 */
const updateTargetRotationEntityQuaternion = (quaternion, timestamp) => {
  const { x, y, z, w } = quaternion;
  targetPositionEntity.object3D.quaternion.set(x, y, z, w);
};

// ORIENTATION
/** @type {HTMLSelectElement} */
const orientationSelect = document.getElementById("orientationSelect");
const orientationOptions = Array.from(
  orientationSelect.querySelectorAll("option"),
).filter((option) => option.value != "none");
orientationSelect.addEventListener("input", () => {
  const device = getPMSGDevice();
  const sensorType = orientationSelect.value;
  device.setSensorConfiguration({
    gameRotation: sensorType == "gameRotation" ? 20 : 0,
    gyroscope: sensorType == "gyroscope" ? 20 : 0,
    orientation: sensorType == "orientation" ? 20 : 0,
  });
});
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    orientationOptions.forEach((option) => {
      option.disabled = !device.hasSensorType(option.value);
    });
    device.addEventListener(
      "getSensorConfiguration",
      (event) => {
        updateTargetRotationEntityEuler();

        const option = orientationOptions.find((option) => {
          return device.sensorConfiguration[option.value] > 0;
        });
        orientationSelect.value = option?.value ?? "none";
      },
      device.connectionAbortSignalObject,
    );
  }
  orientationSelect.disabled = !isConnected;
});

// GAME ROTATION
/** @type {HTMLPreElement} */
const gameRotationDataPre = document.getElementById("gameRotationData");
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "gameRotation",
      (event) => {
        const { gameRotation, timestamp } = event.message;
        gameRotationDataPre.textContent = JSON.stringify(
          { gameRotation, timestamp },
          null,
          2,
        );
        updateTargetRotationEntityQuaternion(gameRotation, timestamp);
      },
      device.connectionAbortSignalObject,
    );
  }
});

// ORIENTATION DATA
/** @type {HTMLPreElement} */
const orientationDataPre = document.getElementById("orientationData");
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "orientation",
      (event) => {
        const { orientation, timestamp } = event.message;
        orientationDataPre.textContent = JSON.stringify(
          { orientation, timestamp },
          null,
          2,
        );
        updateTargetRotationEntityEuler(orientation, timestamp);
      },
      device.connectionAbortSignalObject,
    );
  }
});

// GYROSCOPE
/** @type {HTMLPreElement} */
const gyroscopeDataPre = document.getElementById("gyroscopeData");
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "gyroscope",
      (event) => {
        const { gyroscope, timestamp } = event.message;
        gyroscopeDataPre.textContent = JSON.stringify(
          { gyroscope, timestamp },
          null,
          2,
        );
        const { x: pitch, y: heading, z: roll } = gyroscope;
        updateTargetRotationEntityEuler(
          {
            pitch,
            heading,
            roll,
          },
          timestamp,
        );
      },
      device.connectionAbortSignalObject,
    );
  }
});

// POSITION

/** @type {HTMLSelectElement} */
const positionSelect = document.getElementById("positionSelect");
const positionOptions = Array.from(
  positionSelect.querySelectorAll("option"),
).filter((option) => option.value != "none");
positionSelect.addEventListener("input", () => {
  const device = getPMSGDevice();
  const sensorType = positionSelect.value;
  device.setSensorConfiguration({
    linearAcceleration: sensorType == "linearAcceleration" ? 20 : 0,
    acceleration: sensorType == "acceleration" ? 20 : 0,
    gravity: sensorType == "gravity" ? 20 : 0,
  });
});
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateTargetPositionEntityPosition();
      },
      device.connectionAbortSignalObject,
    );

    positionOptions.forEach((option) => {
      option.disabled = !device.hasSensorType(option.value);
    });
    device.addEventListener(
      "getSensorConfiguration",
      (event) => {
        const option = positionOptions.find((option) => {
          return device.sensorConfiguration[option.value] > 0;
        });
        positionSelect.value = option?.value ?? "none";
      },
      device.connectionAbortSignalObject,
    );
  }
  positionSelect.disabled = !isConnected;
});

// ACCELERATION
/** @type {HTMLPreElement} */
const accelerationDataPre = document.getElementById("accelerationData");
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "acceleration",
      (event) => {
        const { acceleration, timestamp } = event.message;
        accelerationDataPre.textContent = JSON.stringify(
          { acceleration, timestamp },
          null,
          2,
        );
        updateTargetPositionEntityPosition(acceleration, timestamp);
      },
      device.connectionAbortSignalObject,
    );
  }
});

// LINEAR ACCELERATION
/** @type {HTMLPreElement} */
const linearAccelerationDataPre = document.getElementById(
  "linearAccelerationData",
);
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "linearAcceleration",
      (event) => {
        const { linearAcceleration, timestamp } = event.message;
        linearAccelerationDataPre.textContent = JSON.stringify(
          { linearAcceleration, timestamp },
          null,
          2,
        );
        updateTargetPositionEntityPosition(linearAcceleration, timestamp);
      },
      device.connectionAbortSignalObject,
    );
  }
});

// GRAVITY
/** @type {HTMLPreElement} */
const gravityDataPre = document.getElementById("gravityData");
onPMSGDeviceIsConnected((device, isConnected) => {
  if (isConnected) {
    device.addEventListener(
      "gravity",
      (event) => {
        const { gravity, timestamp } = event.message;
        gravityDataPre.textContent = JSON.stringify(
          { gravity, timestamp },
          null,
          2,
        );
        updateTargetPositionEntityPosition(gravity, timestamp);
      },
      device.connectionAbortSignalObject,
    );
  }
});

// TAP DETECTOR
/** @type {HTMLButtonElement} */
const toggleTapDetectorButton = document.getElementById("toggleTapDetector");
toggleTapDetectorButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.toggleSensor("tapDetector", 20);
});

/** @type {HTMLPreElement} */
const tapDetectorDataPre = document.getElementById("tapDetectorData");

const updateToggleTapDetectorButton = () => {
  const device = getPMSGDevice();

  let innerText = "enable tap detector";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.tapDetector > 0
        ? "disable tap detector"
        : "enable tap detector";
    disabled = !device.hasSensorType("tapDetector");
  }

  toggleTapDetectorButton.innerText = innerText;
  toggleTapDetectorButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleTapDetectorButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleTapDetectorButton();
      },
      device.connectionAbortSignalObject,
    );
    device.addEventListener(
      "tapDetector",
      (event) => {
        const { timestamp } = event.message;
        tapDetectorDataPre.textContent = JSON.stringify({ timestamp }, null, 2);
      },
      device.connectionAbortSignalObject,
    );
  }
});

// DEVICE ORIENTATION
/** @type {HTMLButtonElement} */
const toggleDeviceOrientationButton = document.getElementById(
  "toggleDeviceOrientation",
);
toggleDeviceOrientationButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.toggleSensor("deviceOrientation", 20);
});

/** @type {HTMLPreElement} */
const deviceOrientationDataPre = document.getElementById(
  "deviceOrientationData",
);

const updateToggleDeviceOrientationButton = () => {
  const device = getPMSGDevice();

  let innerText = "enable device orientation";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.deviceOrientation > 0
        ? "disable device orientation"
        : "enable device orientation";
    disabled = !device.hasSensorType("deviceOrientation");
  }

  toggleDeviceOrientationButton.innerText = innerText;
  toggleDeviceOrientationButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleDeviceOrientationButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleDeviceOrientationButton();
      },
      device.connectionAbortSignalObject,
    );
    device.addEventListener(
      "deviceOrientation",
      (event) => {
        const { timestamp } = event.message;
        /** @type {"portraitUpright" | "landscapeLeft" | "portraitUpsideDown" | "landscapeRight" | "faceUp" | "faceDown" | "unknown"} */
        const deviceOrientation = event.message.deviceOrientation;
        deviceOrientationDataPre.textContent = JSON.stringify(
          { deviceOrientation, timestamp },
          null,
          2,
        );
      },
      device.connectionAbortSignalObject,
    );
  }
});

// STEP DETECTOR
/** @type {HTMLButtonElement} */
const toggleStepDetectorButton = document.getElementById("toggleStepDetector");
toggleStepDetectorButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.toggleSensor("stepDetector", 20);
});

/** @type {HTMLPreElement} */
const stepDetectorDataPre = document.getElementById("stepDetectorData");

const updateToggleStepDetectorButton = () => {
  const device = getPMSGDevice();

  let innerText = "enable step detector";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.stepDetector > 0
        ? "disable step detector"
        : "enable step detector";
    disabled = !device.hasSensorType("stepDetector");
  }

  toggleStepDetectorButton.innerText = innerText;
  toggleStepDetectorButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleStepDetectorButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleStepDetectorButton();
      },
      device.connectionAbortSignalObject,
    );
    device.addEventListener(
      "stepDetector",
      (event) => {
        const { timestamp } = event.message;
        stepDetectorDataPre.textContent = JSON.stringify(
          { timestamp },
          null,
          2,
        );
      },
      device.connectionAbortSignalObject,
    );
  }
});

// STEP COUNTER
/** @type {HTMLButtonElement} */
const toggleStepCounterButton = document.getElementById("toggleStepCounter");
toggleStepCounterButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.toggleSensor("stepCounter", 20);
});

/** @type {HTMLPreElement} */
const stepCounterDataPre = document.getElementById("stepCounterData");

const updateToggleStepCounterButton = () => {
  const device = getPMSGDevice();

  let innerText = "enable step counter";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.stepCounter > 0
        ? "disable step counter"
        : "enable step counter";
    disabled = !device.hasSensorType("stepCounter");
  }

  toggleStepCounterButton.innerText = innerText;
  toggleStepCounterButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleStepCounterButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleStepCounterButton();
      },
      device.connectionAbortSignalObject,
    );
    device.addEventListener(
      "stepCounter",
      (event) => {
        const { timestamp } = event.message;
        /** @type {number} */
        const stepCounter = event.message.stepCounter;
        stepCounterDataPre.textContent = JSON.stringify(
          { stepCounter, timestamp },
          null,
          2,
        );
      },
      device.connectionAbortSignalObject,
    );
  }
});

// ACTIVITY
/** @type {HTMLButtonElement} */
const toggleActivityButton = document.getElementById("toggleActivity");
toggleActivityButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.toggleSensor("activity", 20);
});

/** @type {HTMLPreElement} */
const activityDataPre = document.getElementById("activityData");

const updateToggleActivityButton = () => {
  const device = getPMSGDevice();

  let innerText = "enable activity recognition";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.activity > 0
        ? "disable activity recognition"
        : "enable activity recognition";
    disabled = !device.hasSensorType("activity");
  }

  toggleActivityButton.innerText = innerText;
  toggleActivityButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleActivityButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleActivityButton();
      },
      device.connectionAbortSignalObject,
    );
    device.addEventListener(
      "activity",
      (event) => {
        const { activity, timestamp } = event.message;
        /** @type {boolean} */
        const still = activity.still;
        activityDataPre.textContent = JSON.stringify(
          { still, timestamp },
          null,
          2,
        );
      },
      device.connectionAbortSignalObject,
    );
  }
});

// TAP DETECTOR
/** @type {HTMLButtonElement} */
const toggleLightButton = document.getElementById("toggleLight");
toggleLightButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.toggleSensor("light", 20);
});

/** @type {HTMLPreElement} */
const lightDataPre = document.getElementById("lightData");

const updateToggleLightButton = () => {
  const device = getPMSGDevice();

  let innerText = "enable light detector";
  let disabled = true;

  if (device?.isConnected) {
    innerText =
      device.sensorConfiguration.light > 0
        ? "disable light detector"
        : "enable light detector";
    disabled = !device.hasSensorType("light");
  }

  toggleLightButton.innerText = innerText;
  toggleLightButton.disabled = disabled;
};
onPMSGDeviceIsConnected((device, isConnected) => {
  updateToggleLightButton();
  if (isConnected) {
    device.addEventListener(
      "getSensorConfiguration",
      () => {
        updateToggleLightButton();
      },
      device.connectionAbortSignalObject,
    );
    device.addEventListener(
      "light",
      (event) => {
        const { timestamp } = event.message;
        const light = event.message.light;
        lightDataPre.textContent = JSON.stringify(
          { light, timestamp },
          null,
          2,
        );
      },
      device.connectionAbortSignalObject,
    );
  }
});

// LEDS
const setLedInterval = 20;
const throttledSetDeviceLeds = BW.ThrottleUtils.throttle(
  /**
   * @param {BW.Device} device
   * @param {BW.LedColorConfiguration[]} ledConfigurations
   */
  (device, ledConfigurations) => {
    device.setLeds(ledConfigurations);
  },
  setLedInterval,
  true,
);
/** @param {BW.LedColorConfiguration[]} ledConfigurations */
const setLeds = (ledConfigurations) => {
  const device = getPMSGDevice();
  if (device) {
    throttledSetDeviceLeds(device, ledConfigurations);
  } else {
    ledConfigurations.forEach(({ index, color }) => {
      updateLed(index, color);
    });
  }
};

const ledsContainer = document.getElementById("leds");
/** @type {{range?: HTMLInputElement, colorInput?: HTMLInputElement, checkbox?: HTMLInputElement}[]} */
const setLedContainers = [];
/** @type {Record<BW.LedType, HTMLTemplateElement>} */
const setLedTemplates = {
  analogSingle: document.getElementById("analogSingleLedTemplate"),
  digitalSingle: document.getElementById("digitalSingleLedTemplate"),
  digitalRGB: document.getElementById("digitalRGBLedTemplate"),
  analogRGB: document.getElementById("analogRGBLedTemplate"),
};

onPMSGDeviceConnected((device) => {
  device.addEventListener(
    "setLed",
    (event) => {
      const { ledIndex, led } = event.message;
      const color = BW.rgbToHex(led.color);
      updateLed(ledIndex, color);
    },
    device.connectionAbortSignalObject,
  );

  setLedContainers.forEach((container) => container.remove());
  setLedContainers.length = 0;

  device.leds.forEach((led, index) => {
    const template = setLedTemplates[led.type];
    const setLedContainer = template.content
      .cloneNode(true)
      .querySelector(".setLed");
    /** @type {HTMLInputElement} */
    const range = setLedContainer.querySelector(`input[type="range"]`);
    let onRangeInput = () => {
      if (!range.isChanging) {
        return;
      }
      device.setLed({ index, brightness: +range.value });
    };
    onRangeInput = BW.ThrottleUtils.throttle(
      onRangeInput,
      setLedInterval,
      true,
    );
    range?.addEventListener("input", () => onRangeInput());
    /** @type {HTMLInputElement} */
    const colorInput = setLedContainer.querySelector(`input[type="color"]`);
    let onColorInput = () => {
      if (!colorInput.isChanging) {
        return;
      }
      device.setLed({ index, color: colorInput.value });
    };
    onColorInput = BW.ThrottleUtils.throttle(
      onColorInput,
      setLedInterval,
      true,
    );
    colorInput?.addEventListener("input", (event) => onColorInput());
    if (colorInput?.disabled) {
      colorInput.value = BW.rgbToHex(led.maxColor);
    }
    /** @type {HTMLInputElement} */
    const checkbox = setLedContainer.querySelector(`input[type="checkbox"]`);
    let onCheckboxInput = () => {
      if (!checkbox.isChanging) {
        return;
      }

      device.setLed({
        index,
        brightness: checkbox.checked ? 255 : 0,
      });
    };
    onCheckboxInput = BW.ThrottleUtils.throttle(
      onCheckboxInput,
      setLedInterval,
      true,
    );
    checkbox?.addEventListener("input", (event) => onCheckboxInput());

    [range, colorInput, checkbox].forEach((input) => {
      input?.addEventListener("focusin", () => {
        input.isChanging = true;
      });
      input?.addEventListener("focusout", () => {
        input.isChanging = false;
      });
      input?.addEventListener("mousedown", (event) => {
        input.isChanging = true;
      });
      if (input?.type != "color") {
        input?.addEventListener("change", (event) => {
          input.isChanging = false;
        });
      }
    });

    setLedContainers[index] = { range, colorInput, checkbox };

    ledsContainer.appendChild(setLedContainer);
  });

  device.addEventListener("setLed", (event) => {
    const { led, ledIndex } = event.message;
    const { range, checkbox, colorInput } = setLedContainers[ledIndex];

    [range, checkbox, colorInput].forEach((input) => {
      if (colorInput && !colorInput.disabled && !colorInput.isChanging) {
        colorInput.value = BW.rgbToHex(led.color);
      }
      if (checkbox && !checkbox.isChanging) {
        checkbox.checked = BW.projectColor(led.color, led.maxColor) > 0;
      }
      if (range && !range.isChanging) {
        range.value = BW.projectColor(led.color, led.maxColor) * 255;
      }
    });
  });
});

// HAPTICS

/** @type {BW.VibrationWaveformSegment[]} */
let vibrationSegments = [];

const vibrationSegmentsContainer = document.getElementById("vibrationSegments");
/** @type {HTMLTemplateElement} */
const vibrationSegmentTemplate = document.getElementById(
  "vibrationSegmentTemplate",
);

/** @type {HTMLButtonElement} */
const addVibrationSegmentButton = document.getElementById(
  "addVibrationSegment",
);
addVibrationSegmentButton.addEventListener("click", () => {
  vibrationSegments.push({ amplitude: 0.5, duration: 500 });
  onVibrationSegmentsUpdate();
  onVibrationSegmentsModify();
});
const onVibrationSegmentsModify = () => {
  vibrationSequenceSelect.value = "custom";
};

const onVibrationSegmentsUpdate = () => {
  addVibrationSegmentButton.disabled =
    vibrationSegments.length >= BW.MaxNumberOfVibrationWaveformSegments;

  vibrationSegmentsContainer.innerHTML = "";

  vibrationSegments.forEach((vibrationSegment) => {
    const vibrationSegmentContainer = vibrationSegmentTemplate.content
      .cloneNode(true)
      .querySelector(".vibrationSegment");
    const amplitudeInput =
      vibrationSegmentContainer.querySelector(".amplitude");
    amplitudeInput.value = vibrationSegment.amplitude;
    amplitudeInput.addEventListener("input", (event) => {
      const amplitude = +event.target.value;
      // console.log({ amplitude });
      vibrationSegment.amplitude = amplitude;
      onVibrationSegmentsModify();
    });
    const durationInput = vibrationSegmentContainer.querySelector(".duration");
    durationInput.value = vibrationSegment.duration;
    durationInput.max = BW.MaxVibrationWaveformSegmentDuration;
    durationInput.addEventListener("input", (event) => {
      const duration = +event.target.value;
      // console.log({ duration });
      vibrationSegment.duration = duration;
      onVibrationSegmentsModify();
    });
    vibrationSegmentContainer
      .querySelector(".delete")
      .addEventListener("click", (event) => {
        vibrationSegments.splice(
          vibrationSegments.indexOf(vibrationSegment),
          1,
        );
        vibrationSegmentContainer.remove();
        onVibrationSegmentsModify();
      });
    vibrationSegmentsContainer.appendChild(vibrationSegmentContainer);
  });
};

/** @type {HTMLButtonElement} */
const triggerVibrationButton = document.getElementById("triggerVibration");
triggerVibrationButton.addEventListener("click", () => {
  const device = getPMSGDevice();
  device?.triggerVibration({ type: "waveform", segments: vibrationSegments });
});
onPMSGDeviceIsConnected((device, isConnected) => {
  triggerVibrationButton.disabled = !isConnected;
});

/** @type {HTMLSelectElement} */
const vibrationSequenceSelect = document.getElementById(
  "vibrationSequenceSelect",
);
vibrationSequenceSelect.addEventListener("input", () => {
  const value = vibrationSequenceSelect.value;
  if (value == "custom") {
    return;
  }
  vibrationSegments.length = 0;
  const rawSegments = value.split(",");
  rawSegments.forEach((amplitudeOrDuration, index) => {
    if (index % 2) {
      const duration = +amplitudeOrDuration;
      vibrationSegments.at(-1).duration = duration;
    } else {
      const amplitude = +amplitudeOrDuration;
      vibrationSegments.push({ amplitude, duration: 0 });
    }
  });
  // console.log("vibrationSegments", vibrationSegments);
  onVibrationSegmentsUpdate();
});
