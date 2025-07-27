export interface VolumeData {
    x: Date;
    y: number;
    buyPressure: number;
    sellPressure: number;
    pressureType: 'buying' | 'selling';
}
