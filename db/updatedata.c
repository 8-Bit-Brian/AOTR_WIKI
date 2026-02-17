#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <string.h>
#include "constantfilenames.h"

#define DEFAULT_ERROR_MESSAGE_LENGTH 9;


int errorCheckedOpen(char* filename, int accessMode);
void* errorCheckedMalloc(int size);
void fatalError(char* errorMessage);

/*
   * Updates armor data of units by reading through the armor.ini file at a predetermined location
   * @return int - returns 0 if the function executes successfully, otherwise it will print an error message and exit the program
*/
int updateArmor() {
    int fd; 
    char* buffer = (char*)errorCheckedMalloc(512);
    fd = errorCheckedOpen(ARMORFILE, O_RDONLY);
    lseek(fd, 436, SEEK_SET); // 438 Bytes is the offset for the armor data within the file before the formatting becomes consistent.
    read(fd,buffer,32);
    printf("[DEBUG] Read Data: %s\n", buffer);
    
    // while(read(fd, buffer, 256) > 0) {
        // printf("[DEBUG] Read data: %s\n", buffer);
    // }
    free(buffer);
    return 0;
}

/* 
    * Utitlity function for error checking and opening a file. If the file fails to open, it will print an error message and exit the program
    * @param char* filename - the name of the file
    * @param int accessMode - the access mode for opening the file
    * @return int - the file descriptor of the opened file
*/
int errorCheckedOpen(char* filename, int accessMode) {
    int fd = open(filename, accessMode);
    if (fd == -1) {
        fatalError(strncat("Failed to open file: ", filename, strlen(filename)));
    } else {
        return fd;
    }
}
/*
    * Utility function for error checking and allocation of memory. If the allocaiton fails, an error message will be printed to stderr and the program will exit
    * @param int size - the size of memory to allocate
    * @return void* - a pointer to the allocated memory
*/
void* errorCheckedMalloc(int size) {
    void* ptr = malloc(size);
    if (ptr == NULL) {
        fatalError("[ERROR] Failed to allocate memory");
    } else {
        return ptr;
    }
}

/*
    * Utility function for printing an error message to stderr and exiting the program
    * @param char* errorMessage - the error message to print
    * @return void - this function does not return anything, it will exit the program
*/
void fatalError(char* messageFromFunction) {
    int errorMessageLength = DEFAULT_ERROR_MESSAGE_LENGTH;
    char* errorMessage = (char*)errorCheckedMalloc(128);

    strcpy(errorMessage, "[ERROR] ");
    strncat(errorMessage, messageFromFunction, 128 - errorMessageLength);
    fprintf(stderr, "%s\n", errorMessage);
    exit(1);
}

int main() {
    if(updateArmor() == 0) {
        printf("[INFO] Updated armor data successfully\n");
    }
}