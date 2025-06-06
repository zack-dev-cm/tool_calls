const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // TX characteristic for micro:bit v2

class Hand {
	constructor() {
		this.bluetoothDevice = undefined;
		this.uartService = undefined;
	}

       async connect() {
               try {
                       this.bluetoothDevice = await navigator.bluetooth.requestDevice({
                               filters: [{ namePrefix: "BBC" }], // Filter for devices with names starting with "BBC"
                               optionalServices: [UART_SERVICE_UUID],
                       });

			const server = await this.bluetoothDevice.gatt.connect();
			const service = await server.getPrimaryService(UART_SERVICE_UUID);
			this.uartService = await service.getCharacteristic(UART_TX_UUID);

                       console.log("Connected to hand!");
                       return true;
               } catch (error) {
                       console.error("Failed to connect to hand:", error);
                       alert("Failed to connect to hand. Please try again.");
                       return false;
               }
       }

       async sendCommand(actionNumber) {
               if (this.uartService === undefined) {
			console.error("Not connected to micro:bit");
			alert("Please connect to Hand first!");
			return;
		}
		try {
			// Convert action number to hex and pad to two characters
			const hexAction = actionNumber.toString(16).toUpperCase().padStart(2, "0");
                       const command = `CMD|0F|${hexAction}|$`;
                       const encoder = new TextEncoder();
                       await this.uartService.writeValue(encoder.encode(command));
                       console.log(`Command sent: ${command}`);
                       return true;
               } catch (error) {
                       console.error("Failed to send command:", error);
                       alert("Failed to send command to Yorick.");
                       return false;
               }
       }
}
